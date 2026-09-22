#!/usr/bin/env node
/**
 * Read-only: how can a given account sign in? Prints the login identifiers
 * on file (masked) for one user id, plus whether an email/phone passed on
 * the command line matches any account at all.
 *
 *   node scripts/whoami-check.js <user-id> [email-or-phone-to-look-up]
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const [, , userId, lookup] = process.argv;
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const mask = (s) => {
  if (!s) return "(none)";
  if (s.includes("@")) { const [u, d] = s.split("@"); return u.slice(0, 3) + "***@" + d; }
  return s.slice(0, 5) + "***" + s.slice(-2);
};

(async () => {
  if (userId) {
    const { data: au } = await supa.auth.admin.getUserById(userId);
    const u = au?.user;
    const { data: row } = await supa.from("users").select("name, role, email, phone").eq("id", userId).maybeSingle();
    console.log("account:", row?.name, `(${row?.role})`);
    console.log("  auth.email :", mask(u?.email), u?.email_confirmed_at ? "(confirmed)" : "");
    console.log("  auth.phone :", mask(u?.phone), u?.phone_confirmed_at ? "(confirmed)" : "");
    console.log("  providers  :", (u?.app_metadata?.providers ?? []).join(", ") || "(none)");
    console.log("  has password:", !!u?.encrypted_password ? "unknown via API" : "n/a");
    console.log("  public.users.email:", mask(row?.email), "| phone:", mask(row?.phone));
  }
  if (lookup) {
    const q = lookup.includes("@")
      ? supa.from("users").select("id, name, role").ilike("email", lookup)
      : supa.from("users").select("id, name, role").eq("phone", lookup);
    const { data } = await q;
    console.log(`\nlookup ${mask(lookup)}:`, data?.length ? data.map((r) => `${r.name} (${r.role}) ${r.id.slice(0, 8)}…`).join(", ") : "no account");
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
