#!/usr/bin/env node
/**
 * Delete the seeded demo accounts -- every auth user whose email ends in
 * @getdraft.app -- from the configured Supabase project.
 *
 * Why: coaches on the live app were opening "Matteo Rossi", "Marie Dubois"
 * and the rest from the rankings and asking whether they were real. They are
 * not; they came from scripts/seed-demo*.js so the reviewer deck and the
 * leaderboard would not be empty. Now that real athletes exist they are
 * noise, and worse than noise for a coach who spends time on one.
 *
 * Deleting the auth user cascades (public.users -> profiles, swipes, matches,
 * messages, posts, subscriptions ...), so a coach's match with a fake athlete
 * disappears with the athlete. That is what the client asked for.
 *
 * Safety:
 *   - DRY RUN by default. Prints what would go and exits. Pass --yes to delete.
 *   - Only @getdraft.app emails. The store-reviewer account is phone-only and
 *     untouched; every real user has a real address.
 *   - role='admin' rows are skipped even if they match, so an admin login on
 *     the demo domain is never removed by accident.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from backend/.env.
 * Run from backend/:
 *     node scripts/delete-demo-users.js          # dry run
 *     node scripts/delete-demo-users.js --yes    # delete
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

const DEMO_DOMAIN = "@getdraft.app";
const confirm = process.argv.includes("--yes");

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllAuthUsers() {
  const all = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    all.push(...(data?.users ?? []));
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return all;
}

(async () => {
  console.log(`Target project host: ${new URL(SUPABASE_URL).host}`);

  const authUsers = await listAllAuthUsers();
  const candidates = authUsers.filter((u) =>
    (u.email ?? "").toLowerCase().endsWith(DEMO_DOMAIN),
  );
  console.log(`auth users: ${authUsers.length}, matching ${DEMO_DOMAIN}: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Names and roles from public.users, for the review table and the admin guard.
  const { data: rows, error } = await supa
    .from("users")
    .select("id, name, role, email")
    .in("id", candidates.map((u) => u.id));
  if (error) throw new Error(error.message);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));

  const toDelete = [];
  const skipped = [];
  for (const u of candidates) {
    const row = byId.get(u.id);
    const role = row?.role ?? "(no profile row)";
    if (role === "admin") skipped.push({ u, row });
    else toDelete.push({ u, row });
  }

  console.log("\nWill delete:");
  for (const { u, row } of toDelete) {
    console.log(
      `  ${String(row?.role ?? "?").padEnd(9)} ${String(row?.name ?? "").padEnd(22)} ${u.email}`,
    );
  }
  if (skipped.length) {
    console.log("\nSkipped (admin):");
    for (const { u } of skipped) console.log(`  ${u.email}`);
  }

  if (!confirm) {
    console.log(`\nDRY RUN -- nothing deleted. Re-run with --yes to delete ${toDelete.length} account(s).`);
    return;
  }

  console.log(`\nDeleting ${toDelete.length} account(s)...`);
  let ok = 0;
  for (const { u, row } of toDelete) {
    const { error: delErr } = await supa.auth.admin.deleteUser(u.id);
    if (delErr) {
      console.error(`  FAILED ${u.email}: ${delErr.message}`);
    } else {
      ok += 1;
      console.log(`  deleted ${row?.name ?? ""} <${u.email}>`);
    }
  }
  console.log(`\nDone: ${ok}/${toDelete.length} deleted.`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
