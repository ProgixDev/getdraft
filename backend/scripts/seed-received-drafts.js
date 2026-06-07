/**
 * Seed a few INCOMING drafts toward a demo account so the Draft Board
 * "Received" tab has content for the recording.
 *
 * Usage:
 *   node scripts/seed-received-drafts.js                 # prints all users + STOPS
 *   node scripts/seed-received-drafts.js <demo-email>    # seeds drafts toward that account
 *
 * The script inserts swipes (swiper=drafter, swiped=demo, direction='draft')
 * directly — it does NOT create the reciprocal swipe and does NOT touch the
 * matches table, so the rows stay PENDING in "who-drafted-me" until the demo
 * user opens Received and taps Accept (which triggers the normal mutual-match
 * code path → "Game On!").
 *
 * Idempotent: skips any (drafter, demo) pair that already exists.
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

const TARGET_COUNT = 4;

async function printUsersAndExit() {
  const { data, error } = await supa
    .from("users")
    .select("email, name, role")
    .order("role", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("users.select failed:", error.message);
    process.exit(1);
  }
  console.log("No email argument provided. Available users:\n");
  for (const u of data || []) {
    console.log(
      `  ${u.email.padEnd(40)}  ${(u.role || "?").padEnd(10)}  ${u.name || ""}`,
    );
  }
  console.log(
    `\nRe-run with: node scripts/seed-received-drafts.js <email>`,
  );
  process.exit(0);
}

async function run() {
  const email = process.argv[2];
  if (!email) await printUsersAndExit();

  // 1) Resolve target
  const { data: target, error: tErr } = await supa
    .from("users")
    .select("id, email, name, role")
    .eq("email", email)
    .maybeSingle();
  if (tErr) throw new Error(`target lookup: ${tErr.message}`);
  if (!target) {
    console.error(`No user with email "${email}".`);
    process.exit(1);
  }
  console.log(`▶ Target: ${target.name || "Unnamed"} <${target.email}> (${target.role})`);

  // 2) Find candidate drafters: not target, not banned, not parent (parents
  //    don't swipe by design), prefer demo.* emails for image-rich cards.
  const { data: candidates, error: cErr } = await supa
    .from("users")
    .select("id, email, name, role, avatar_url")
    .neq("id", target.id)
    .neq("role", "parent")
    .eq("is_banned", false);
  if (cErr) throw new Error(`candidates: ${cErr.message}`);
  if (!candidates || candidates.length === 0) {
    console.error("No candidate drafters found.");
    process.exit(1);
  }

  // 3) Exclude anyone the TARGET has already swiped on — they wouldn't show
  //    up in who-drafted-me anyway (resolved or matched).
  const { data: targetSwipes, error: sErr } = await supa
    .from("swipes")
    .select("swiped_id")
    .eq("swiper_id", target.id);
  if (sErr) throw new Error(`target swipes: ${sErr.message}`);
  const swipedByTarget = new Set((targetSwipes || []).map((r) => r.swiped_id));

  // 4) Skip anyone whose draft toward the target already exists.
  const { data: existingDrafts, error: eErr } = await supa
    .from("swipes")
    .select("swiper_id")
    .eq("swiped_id", target.id)
    .eq("direction", "draft");
  if (eErr) throw new Error(`existing drafts: ${eErr.message}`);
  const alreadyDrafted = new Set((existingDrafts || []).map((r) => r.swiper_id));

  // 5) Rank: demo.* users with avatar first, then everyone else.
  const ranked = [...candidates]
    .filter((u) => !swipedByTarget.has(u.id) && !alreadyDrafted.has(u.id))
    .sort((a, b) => {
      const aDemo = a.email.startsWith("demo.") ? 0 : 1;
      const bDemo = b.email.startsWith("demo.") ? 0 : 1;
      if (aDemo !== bDemo) return aDemo - bDemo;
      const aAvatar = a.avatar_url ? 0 : 1;
      const bAvatar = b.avatar_url ? 0 : 1;
      return aAvatar - bAvatar;
    });

  const picks = ranked.slice(0, TARGET_COUNT);
  const skippedSwiped = candidates.filter((u) => swipedByTarget.has(u.id)).length;
  const skippedExisting = candidates.filter((u) => alreadyDrafted.has(u.id)).length;

  if (picks.length === 0) {
    console.log("\nNothing to seed:");
    console.log(`  ${candidates.length} candidates, ${skippedSwiped} already swiped by target, ${skippedExisting} already drafted target.`);
    process.exit(0);
  }

  console.log(`\nSeeding ${picks.length} incoming drafts (skipped ${skippedSwiped} already swiped + ${skippedExisting} already drafted)...`);

  let inserted = 0;
  for (const u of picks) {
    const { error } = await supa.from("swipes").insert({
      swiper_id: u.id,
      swiped_id: target.id,
      direction: "draft",
    });
    if (error) {
      console.log(`  ! ${u.email.padEnd(36)}  ${error.message}`);
      continue;
    }
    inserted++;
    console.log(`  ✔ ${u.email.padEnd(36)}  ${u.name || "Unnamed"} (${u.role})`);
  }

  // 6) Bump likes_received for the target (athlete only — RPC updates
  //    athlete_profiles). Best-effort: the supabase-js rpc() builder is
  //    awaited, not .catch'd; swallow errors so this never fails the seed.
  if (target.role === "athlete" && inserted > 0) {
    for (let i = 0; i < inserted; i++) {
      try {
        await supa.rpc("increment_likes_received", { target_user_id: target.id });
      } catch {
        /* ignore — cosmetic bump only */
      }
    }
  }

  console.log(`\n${inserted} user${inserted === 1 ? "" : "s"} now drafted ${target.email}`);
  console.log(`Open the app → log in as ${target.email} → Draft Board → Received.`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e?.stack || e?.message || e);
    process.exit(1);
  });
