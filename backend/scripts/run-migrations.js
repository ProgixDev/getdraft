#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PAT = process.env.SUPABASE_PAT || process.argv[2];
const REF = process.env.SUPABASE_REF || process.argv[3];

if (!PAT || !REF) {
  console.error('Usage: SUPABASE_PAT=... SUPABASE_REF=... node scripts/run-migrations.js');
  console.error('   or: node scripts/run-migrations.js <PAT> <REF>');
  process.exit(2);
}

const migrationsDir = path.resolve(__dirname, '..', 'src', 'database', 'migrations');
const files = fs.readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error(`No .sql files in ${migrationsDir}`);
  process.exit(2);
}

const endpoint = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function runSql(sql) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text };
}

// Local tracking table so re-runs are idempotent and we get an explicit
// "everything applied" signal. (Distinct from supabase_migrations.* which the
// dashboard/CLI manage — this is owned by our runner.)
const ENSURE_TRACKING = `
  CREATE TABLE IF NOT EXISTS public._app_migrations (
    filename    TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

async function appliedSet() {
  const r = await runSql('SELECT filename FROM public._app_migrations;');
  if (!r.ok) return new Set(); // table may not exist yet on first run
  try {
    // The Supabase query API returns a JSON array of rows.
    const rows = JSON.parse(r.body);
    return new Set((Array.isArray(rows) ? rows : []).map((row) => row.filename));
  } catch {
    return new Set();
  }
}

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

(async () => {
  const ensure = await runSql(ENSURE_TRACKING);
  if (!ensure.ok) {
    console.error('Could not create tracking table public._app_migrations:');
    console.error(ensure.body);
    process.exit(1);
  }

  const done = await appliedSet();
  let applied = 0;
  let skipped = 0;

  for (const file of files) {
    if (done.has(file)) {
      console.log(`-> ${file} ... SKIP (already applied)`);
      skipped++;
      continue;
    }
    process.stdout.write(`-> ${file} ... `);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const r = await runSql(sql);
    if (!r.ok) {
      console.log(`FAIL (HTTP ${r.status})`);
      console.error(`\nMigration failed: ${file}`);
      console.error('Response body:');
      console.error(r.body);
      process.exit(1);
    }
    const mark = await runSql(
      `INSERT INTO public._app_migrations (filename) VALUES ('${sqlEscape(file)}') ON CONFLICT (filename) DO NOTHING;`,
    );
    if (!mark.ok) {
      console.log(`OK but FAILED TO RECORD (HTTP ${mark.status})`);
      console.error(mark.body);
      process.exit(1);
    }
    console.log(`OK (HTTP ${r.status})`);
    applied++;
  }

  console.log(
    `\nDone. ${applied} applied, ${skipped} already up to date. ${files.length} total migration file(s).`,
  );
})().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
