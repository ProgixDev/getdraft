/**
 * Self-contained smoke test for comment likes.
 *   admin-create throwaway user -> login -> create post -> create comment + reply
 *   -> like the top-level -> assert likesCount=1 / likedByMe=true
 *   -> like the reply -> assert reply likesCount=1 / likedByMe=true
 *   -> unlike top-level -> assert 0 / false -> delete throwaway user.
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

const API = 'http://localhost:3000/api';
const EMAIL = `smoke+${Date.now()}@getdraft.app`;
const PASSWORD = 'GetDraft2026!';

// Important: only set Content-Type when there's a body. Fastify rejects
// "Content-Type: application/json" requests with no body as 400.
async function api(method, p, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${API}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const unwrap = (r) =>
  r.body && typeof r.body === 'object' && 'data' in r.body ? r.body.data : r.body;
function assert(cond, msg) { if (!cond) throw new Error(`assert: ${msg}`); }

(async () => {
  let userId;
  try {
    const { data, error } = await supa.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'athlete', name: 'CL Smoke' },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    userId = data.user.id;
    await supa.from('users').update({ role: 'athlete', is_onboarded: true }).eq('id', userId);
    console.log('temp user', EMAIL, userId);

    const login = await api('POST', '/auth/login', null, { email: EMAIL, password: PASSWORD });
    assert(login.status === 201, `login ${login.status}`);
    const token = login.body.data.accessToken;

    const created = await api('POST', '/posts', token, {
      kind: 'post',
      mediaUrl: 'https://jzzsnputbvzxssbraetl.supabase.co/storage/v1/object/public/sports/american-football.jpg',
      mediaType: 'image',
      caption: 'comment likes smoke',
    });
    assert(created.status === 201, `post ${created.status}`);
    const post = unwrap(created);

    const c1 = unwrap(await api('POST', `/posts/${post.id}/comments`, token, { text: 'top-level' }));
    const c2 = unwrap(await api('POST', `/posts/${post.id}/comments`, token, { text: 'reply!', parentId: c1.id }));
    assert(c1?.id && c2?.id, 'comment ids');
    assert(c1.likesCount === 0 && c1.likedByMe === false, `fresh top: ${c1.likesCount}/${c1.likedByMe}`);

    // LIKE top-level
    const liked = await api('POST', `/posts/comments/${c1.id}/like`, token, {});
    assert(liked.status === 201, `like top status=${liked.status} body=${JSON.stringify(liked.body)}`);

    let fresh = unwrap(await api('GET', `/posts/${post.id}/comments`, token));
    let t1 = fresh.find((x) => x.id === c1.id);
    let r1 = (t1?.replies ?? []).find((x) => x.id === c2.id);
    assert(t1.likesCount === 1 && t1.likedByMe === true, `top after like: ${t1.likesCount}/${t1.likedByMe}`);
    assert(r1.likesCount === 0 && r1.likedByMe === false, `reply unchanged: ${r1.likesCount}/${r1.likedByMe}`);
    console.log('LIKE OK  top.likesCount=1, top.likedByMe=true, reply still 0/false');

    // LIKE reply
    const likedReply = await api('POST', `/posts/comments/${c2.id}/like`, token, {});
    assert(likedReply.status === 201, `like reply status=${likedReply.status}`);
    fresh = unwrap(await api('GET', `/posts/${post.id}/comments`, token));
    t1 = fresh.find((x) => x.id === c1.id);
    r1 = (t1?.replies ?? []).find((x) => x.id === c2.id);
    assert(r1.likesCount === 1 && r1.likedByMe === true, `reply after like: ${r1.likesCount}/${r1.likedByMe}`);
    console.log('REPLY LIKE OK  reply.likesCount=1, reply.likedByMe=true');

    // UNLIKE top-level
    const unliked = await api('DELETE', `/posts/comments/${c1.id}/like`, token);
    assert(unliked.status === 200, `unlike status=${unliked.status} body=${JSON.stringify(unliked.body)}`);
    fresh = unwrap(await api('GET', `/posts/${post.id}/comments`, token));
    t1 = fresh.find((x) => x.id === c1.id);
    assert(t1.likesCount === 0 && t1.likedByMe === false, `top after unlike: ${t1.likesCount}/${t1.likedByMe}`);
    console.log('UNLIKE OK  top.likesCount=0, top.likedByMe=false');

    console.log('\nSMOKE OK  comment likes (insert + dedup + delete + counts) work end-to-end');
  } catch (e) {
    console.error('\nSMOKE FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    if (userId) {
      const { error } = await supa.auth.admin.deleteUser(userId);
      console.log('cleanup', error ? `FAIL ${error.message}` : 'OK (temp user removed)');
    }
  }
})();
