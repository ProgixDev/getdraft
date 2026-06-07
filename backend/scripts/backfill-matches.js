/**
 * Backfill missing matches: for every pair (A, B) where A drafted B AND B
 * drafted A, create the canonical (user_1_id < user_2_id) match row if no
 * active one exists. Idempotent — re-running prints "0 missing" once caught up.
 *
 * Recovers any historical "mutual-draft-without-match" cases caused by the
 * previous swallow-the-error behavior in discover.service.swipe().
 *
 * Run:  node scripts/backfill-matches.js     (from backend/)
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function key(a, b) {
  return `${a}|${b}`;
}

function canonical(a, b) {
  return a < b ? [a, b] : [b, a];
}

async function run() {
  console.log("▶ Loading all draft swipes...");
  const { data: drafts, error: dErr } = await supa
    .from("swipes")
    .select("swiper_id, swiped_id")
    .eq("direction", "draft");
  if (dErr) throw new Error(`swipes.select: ${dErr.message}`);
  console.log(`  ${drafts.length} draft swipes`);

  const draftSet = new Set();
  for (const r of drafts) draftSet.add(key(r.swiper_id, r.swiped_id));

  // Mutual pairs (deduped to canonical order)
  const mutuals = new Set();
  for (const k of draftSet) {
    const [a, b] = k.split("|");
    if (draftSet.has(key(b, a))) {
      const [u1, u2] = canonical(a, b);
      mutuals.add(key(u1, u2));
    }
  }
  console.log(`  ${mutuals.size} mutual draft pairs`);

  // Existing active matches
  const { data: matches, error: mErr } = await supa
    .from("matches")
    .select("user_1_id, user_2_id")
    .eq("is_active", true);
  if (mErr) throw new Error(`matches.select: ${mErr.message}`);
  const matchSet = new Set();
  for (const m of matches) matchSet.add(key(m.user_1_id, m.user_2_id));
  console.log(`  ${matches.length} existing active matches`);

  const missing = [...mutuals].filter((k) => !matchSet.has(k));
  console.log(`  ${missing.length} missing → backfilling...`);

  if (missing.length === 0) {
    console.log("\nNothing to do. ✔");
    return;
  }

  let created = 0;
  let revived = 0;
  let skipped = 0;
  for (const k of missing) {
    const [u1, u2] = k.split("|");
    // Try insert first
    const ins = await supa
      .from("matches")
      .insert({ user_1_id: u1, user_2_id: u2 })
      .select("id")
      .single();
    if (!ins.error) {
      created++;
      console.log(`  ✔ created ${u1.slice(0, 8)}…↔${u2.slice(0, 8)}… → ${ins.data.id}`);
      continue;
    }
    // Unique violation → row exists but was inactive; flip is_active=true
    const dup = /duplicate key|unique/i.test(ins.error.message);
    if (dup) {
      const upd = await supa
        .from("matches")
        .update({ is_active: true })
        .eq("user_1_id", u1)
        .eq("user_2_id", u2)
        .select("id")
        .single();
      if (!upd.error) {
        revived++;
        console.log(`  ↺ revived ${u1.slice(0, 8)}…↔${u2.slice(0, 8)}… → ${upd.data.id}`);
        continue;
      }
      console.log(
        `  ! ${u1.slice(0, 8)}…↔${u2.slice(0, 8)}…: ${upd.error.message}`,
      );
      skipped++;
    } else {
      console.log(
        `  ! ${u1.slice(0, 8)}…↔${u2.slice(0, 8)}…: ${ins.error.message}`,
      );
      skipped++;
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  Created: ${created}`);
  console.log(`  Revived: ${revived}`);
  console.log(`  Skipped: ${skipped}`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Backfill failed:", e?.stack || e?.message || e);
    process.exit(1);
  });
