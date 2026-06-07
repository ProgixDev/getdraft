const fs = require('fs');
const path = require('path');
const PAT = process.env.SUPABASE_PAT || process.argv[2];
const ref = 'jzzsnputbvzxssbraetl';
if (!PAT) { console.error('Pass PAT as arg or SUPABASE_PAT env'); process.exit(1); }
const sql = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'database', 'migrations', '009_athlete_demographics.sql'),
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

  const check = await q(
    "select column_name, data_type from information_schema.columns " +
    "where table_schema='public' and table_name='athlete_profiles' " +
    "and column_name in ('date_of_birth','gender','experience','jersey_number') " +
    'order by column_name;',
  );
  console.log('CHECK status', check.status);
  console.log(JSON.stringify(check.body, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
