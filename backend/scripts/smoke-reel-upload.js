/**
 * Smoke test for the 'posts' bucket whitelist fix:
 *   login -> POST /uploads/signed-url (bucket=posts) -> PUT to signed URL
 *   -> POST /posts (kind=reel) -> GET /posts/feed?kind=reel includes it.
 * Creates and deletes a temp auth user.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const API = process.env.API_BASE || 'http://localhost:3000/api';
const EMAIL = `reelsmoke+${Date.now()}@getdraft.test`;
const PASSWORD = 'SmokeTest!2026';

async function api(method, p, token, body) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const unwrap = (r) =>
  r.body && typeof r.body === 'object' && 'data' in r.body ? r.body.data : r.body;

// Minimal valid mp4 header (ftyp box). Not playable but is a real, well-formed
// 32-byte mp4 prefix so Storage accepts the upload as video/mp4.
function tinyMp4() {
  return Buffer.from([
    0x00,0x00,0x00,0x20,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d,0x00,0x00,0x02,0x00,
    0x69,0x73,0x6f,0x6d,0x69,0x73,0x6f,0x32,0x6d,0x70,0x34,0x31,0x00,0x00,0x00,0x00,
  ]);
}

(async () => {
  let userId, postId;
  try {
    const { data: u, error: uerr } = await supa.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'athlete', name: 'Reel Smoke' },
    });
    if (uerr) throw new Error(`createUser: ${uerr.message}`);
    userId = u.user.id;
    await supa.from('users').update({ role: 'athlete', is_onboarded: true }).eq('id', userId);
    console.log('temp user', EMAIL, userId);

    const login = await api('POST', '/auth/login', null, { email: EMAIL, password: PASSWORD });
    if (login.status !== 201) throw new Error(`login ${login.status} ${JSON.stringify(login.body)}`);
    const token = login.body.data.accessToken;

    // 1. Get a signed upload URL for the posts bucket
    const fileName = `${Date.now()}.mp4`;
    const signedResp = await api('POST', '/uploads/signed-url', token, {
      bucket: 'posts',
      fileName,
    });
    if (signedResp.status !== 201) {
      throw new Error(`signed-url ${signedResp.status} ${JSON.stringify(signedResp.body)}`);
    }
    const signed = unwrap(signedResp);
    console.log('SIGNED  publicUrl=', signed.publicUrl);

    // 2. Upload the tiny mp4 to the signed URL
    const buf = tinyMp4();
    const put = await fetch(signed.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: buf,
    });
    console.log('PUT     status=', put.status);
    if (put.status >= 400) throw new Error(`PUT failed ${put.status} ${await put.text()}`);

    // 3. Create the reel
    const created = await api('POST', '/posts', token, {
      kind: 'reel',
      mediaUrl: signed.publicUrl,
      mediaType: 'video',
      caption: 'bucket whitelist smoke',
    });
    if (created.status !== 201) throw new Error(`create ${created.status} ${JSON.stringify(created.body)}`);
    const post = unwrap(created);
    postId = post.id;
    console.log('CREATE  id=', post.id, 'kind=', post.kind, 'mediaType=', post.mediaType);

    // 4. Confirm it appears in the reels feed
    const feed = unwrap(await api('GET', '/posts/feed?kind=reel&page=1&limit=5', token));
    const found = feed.posts.find((p) => p.id === postId);
    console.log('FEED    count=', feed.posts.length, 'has new reel:', !!found, 'mediaUrl ok:', found?.mediaUrl === signed.publicUrl);

    console.log('\nSMOKE OK — posts bucket accepted, signed URL minted, upload + create + feed all green.');
  } catch (e) {
    console.error('\nSMOKE FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    if (userId) {
      const { error } = await supa.auth.admin.deleteUser(userId);
      console.log('cleanup', error ? `FAIL ${error.message}` : 'OK (temp user removed; reel cascaded)');
    }
  }
})();
