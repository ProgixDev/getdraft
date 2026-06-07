/**
 * One-shot smoke test of the posts module. Creates a temp auth user via the
 * admin API, logs in to grab a JWT, exercises post/like/comment/reply, then
 * deletes the temp user. No data persisted on success.
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
const EMAIL = `smoke+${Date.now()}@getdraft.test`;
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
  let json;
  const t = await r.text();
  try { json = JSON.parse(t); } catch { json = t; }
  return { status: r.status, body: json };
}

function unwrap(resp) {
  return resp.body && typeof resp.body === 'object' && 'data' in resp.body
    ? resp.body.data
    : resp.body;
}

(async () => {
  let userId;
  try {
    // 1. Create temp user via admin (skips email verify)
    const { data, error } = await supa.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'athlete', name: 'Smoke Tester' },
    });
    if (error) throw new Error(`admin.createUser: ${error.message}`);
    userId = data.user.id;
    await supa.from('users').update({ role: 'athlete', is_onboarded: true })
      .eq('id', userId);
    console.log('temp user', EMAIL, userId);

    // 2. Login -> JWT
    const login = await api('POST', '/auth/login', null, {
      email: EMAIL, password: PASSWORD,
    });
    if (login.status !== 201) throw new Error(`login ${login.status} ${JSON.stringify(login.body)}`);
    const token = login.body.data.accessToken;
    if (!token) throw new Error('no accessToken');

    // 3. Create a 'post'
    const created = await api('POST', '/posts', token, {
      kind: 'post',
      mediaUrl: 'https://jzzsnputbvzxssbraetl.supabase.co/storage/v1/object/public/sports/american-football.jpg',
      mediaType: 'image',
      caption: 'Smoke test post',
    });
    if (created.status !== 201) throw new Error(`create ${created.status} ${JSON.stringify(created.body)}`);
    const post = unwrap(created);
    console.log('CREATE id=', post.id, 'likes=', post.likesCount, 'comments=', post.commentsCount, 'author=', post.author?.name);

    // 4. Feed
    const feed = await api('GET', '/posts/feed?kind=post&page=1&limit=10', token);
    if (feed.status !== 200) throw new Error(`feed ${feed.status} ${JSON.stringify(feed.body)}`);
    const feedData = unwrap(feed);
    const found = feedData.posts.find((p) => p.id === post.id);
    console.log('FEED count=', feedData.posts.length, 'has new post:', !!found, 'likedByMe=', found?.likedByMe, 'likesCount=', found?.likesCount);

    // 5. Like (Fastify rejects empty body with application/json — send {})
    const liked = await api('POST', `/posts/${post.id}/like`, token, {});
    if (liked.status !== 201) throw new Error(`like ${liked.status} ${JSON.stringify(liked.body)}`);
    const feedAfterLike = unwrap(await api('GET', '/posts/feed?kind=post&page=1&limit=10', token));
    const afterLike = feedAfterLike.posts.find((p) => p.id === post.id);
    console.log('AFTER LIKE  likedByMe=', afterLike.likedByMe, 'likesCount=', afterLike.likesCount);

    // 6. Add a top-level comment
    const comment = await api('POST', `/posts/${post.id}/comments`, token, { text: 'Nice form!' });
    if (comment.status !== 201) throw new Error(`comment ${comment.status} ${JSON.stringify(comment.body)}`);
    const c = unwrap(comment);
    console.log('COMMENT id=', c.id, 'text=', c.text);

    // 7. Reply to that comment
    const reply = await api('POST', `/posts/${post.id}/comments`, token, { text: 'Thanks!', parentId: c.id });
    if (reply.status !== 201) throw new Error(`reply ${reply.status} ${JSON.stringify(reply.body)}`);
    console.log('REPLY id=', unwrap(reply).id);

    // 8. Get comments
    const list = await api('GET', `/posts/${post.id}/comments`, token);
    const comments = unwrap(list);
    console.log('LIST top-level count=', comments.length, 'replies on first=', comments[0]?.replies?.length, 'reply text=', comments[0]?.replies?.[0]?.text);

    // 9. Check commentsCount on the post
    const feedFinal = unwrap(await api('GET', '/posts/feed?kind=post&page=1&limit=10', token));
    const final = feedFinal.posts.find((p) => p.id === post.id);
    console.log('FINAL commentsCount=', final.commentsCount, 'likesCount=', final.likesCount);

    console.log('\nSMOKE OK');
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
