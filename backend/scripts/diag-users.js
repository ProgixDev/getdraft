const fs = require("fs"), path = require("path");
const env = {};
fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
});
const { createClient } = require("@supabase/supabase-js");
const s = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
(async () => {
  const { data: users, error } = await s
    .from("users")
    .select("id,email,name,role,country,is_onboarded,created_at")
    .order("created_at", { ascending: true });
  if (error) { console.error("ERR", error.message); process.exit(1); }
  console.log("TOTAL USERS:", users.length);
  for (const u of users) {
    console.log(`- ${String(u.role).padEnd(10)} ${String(u.name || u.email).padEnd(24)} country=${u.country || "(none)"} onboarded=${u.is_onboarded}`);
  }
  const rec = users.filter((u) => u.role === "coach" || u.role === "recruiter");
  const ath = users.filter((u) => u.role === "athlete");
  console.log(`\nRECRUITERS/COACHES: ${rec.length}  |  ATHLETES: ${ath.length}`);
  const { count: rp } = await s.from("recruiter_profiles").select("*", { count: "exact", head: true });
  const { count: ap } = await s.from("athlete_profiles").select("*", { count: "exact", head: true });
  console.log(`recruiter_profiles: ${rp}  |  athlete_profiles: ${ap}`);
  const { data: swipes } = await s.from("swipes").select("swiper_id").limit(1000);
  console.log(`swipes rows: ${swipes ? swipes.length : 0}`);
})().catch((e) => { console.error(e); process.exit(1); });
