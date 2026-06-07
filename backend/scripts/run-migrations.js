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

async function runOne(file) {
  const full = path.join(migrationsDir, file);
  const sql = fs.readFileSync(full, 'utf8');
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

(async () => {
  for (const file of files) {
    process.stdout.write(`-> ${file} ... `);
    const r = await runOne(file);
    if (!r.ok) {
      console.log(`FAIL (HTTP ${r.status})`);
      console.error(`\nMigration failed: ${file}`);
      console.error('Response body:');
      console.error(r.body);
      process.exit(1);
    }
    console.log(`OK (HTTP ${r.status})`);
  }
  console.log(`\nAll ${files.length} migration(s) applied.`);
})().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
