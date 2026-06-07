#!/usr/bin/env node
/**
 * Destructive: wipes every auth.users row in the configured Supabase project.
 * public.users -> auth.users is ON DELETE CASCADE, and every downstream table
 * cascades off public.users, so removing each auth user also removes its
 * athlete/recruiter/parent profile, swipes, matches, subscriptions, etc.
 *
 * Schema, Storage buckets, and bucket contents are NOT touched. Re-seed via
 * scripts/seed-demo-users.js + scripts/upload-sport-images.js.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from backend/.env. No hardcoded
 * secrets. Run from backend/:  node scripts/delete-all-users.js
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

const host = new URL(SUPABASE_URL).host;
console.log(`Target project host: ${host}`);

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllUsers() {
  const all = [];
  const perPage = 200;
  let page = 1;
  for (;;) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error(`listUsers page ${page} error:`, error.message);
      process.exit(1);
    }
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < perPage) break;
    page += 1;
  }
  return all;
}

(async () => {
  const before = await listAllUsers();
  console.log(`found ${before.length} users`);
  for (const u of before) console.log(`  - ${u.email || "(no email)"} ${u.id}`);

  if (before.length === 0) {
    console.log("nothing to delete.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const u of before) {
    const { error } = await supa.auth.admin.deleteUser(u.id);
    if (error) {
      fail += 1;
      console.log(`FAIL ${u.email || u.id}: ${error.message}`);
    } else {
      ok += 1;
      console.log(`ok   ${u.email || u.id}`);
    }
  }

  const after = await listAllUsers();
  console.log("\n========================= SUMMARY =========================");
  console.log(`deleted: ${ok}, failed: ${fail}`);
  console.log(`remaining auth users: ${after.length}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
