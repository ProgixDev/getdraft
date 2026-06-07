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
  const { data: users } = await s.from("users").select("id,name,role");
  const nameOf = (id) => { const u = (users || []).find((x) => x.id === id); return u ? `${u.name}(${u.role})` : id; };
  const { data: matches } = await s.from("matches").select("id,user_1_id,user_2_id,is_active,created_at").order("created_at", { ascending: true });
  console.log("MATCHES:", matches ? matches.length : 0);
  for (const m of matches || []) console.log(`  - ${nameOf(m.user_1_id)}  <->  ${nameOf(m.user_2_id)}  active=${m.is_active}`);
  const { data: swipes } = await s.from("swipes").select("swiper_id,swiped_id,direction").order("created_at", { ascending: true });
  console.log("\nSWIPES:", swipes ? swipes.length : 0);
  for (const sw of swipes || []) console.log(`  - ${nameOf(sw.swiper_id)}  --${sw.direction}-->  ${nameOf(sw.swiped_id)}`);
})().catch((e) => { console.error(e); process.exit(1); });
