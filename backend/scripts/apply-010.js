const fs = require('fs');
const path = require('path');
const PAT = process.env.SUPABASE_PAT || process.argv[2];
const ref = 'jzzsnputbvzxssbraetl';
if (!PAT) { console.error('Pass PAT as arg or SUPABASE_PAT env'); process.exit(1); }
const sql = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'database', 'migrations', '010_posts_reels.sql'),
  'utf8',
);

async function q(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}

(async () => {
  const apply = await q(sql);
  console.log('APPLY status', apply.status);
  if (apply.status >= 400) {
    console.error(apply.body);
    process.exit(1);
  }

  const tables = await q(
    "select table_name from information_schema.tables " +
    "where table_schema='public' and table_name in ('posts','post_likes','post_comments') " +
    'order by table_name;',
  );
  console.log('TABLES', tables.status, JSON.stringify(tables.body));

  const triggers = await q(
    "select trigger_name from information_schema.triggers " +
    "where event_object_schema='public' and trigger_name in ('trg_post_likes','trg_post_comments') " +
    'order by trigger_name;',
  );
  console.log('TRIGGERS', triggers.status, JSON.stringify(triggers.body));
})().catch((e) => { console.error(e); process.exit(1); });
