/**
 * Open DMs smoke: 2 throwaway users -> A POST /conversations { userId: B } ->
 * both join_conversation -> A send_dm -> assert B receives 'new_dm';
 * GET /conversations for A shows the conv with lastMessage + unreadCount.
 * Cleans up users.
 */
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
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
const ORIGIN = 'http://localhost:3000';
const TS = Date.now();
const A_EMAIL = `dmA+${TS}@getdraft.app`;
const B_EMAIL = `dmB+${TS}@getdraft.app`;
const PASSWORD = 'GetDraft2026!';

async function api(method, p, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${API}${p}`, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const unwrap = (r) =>
  r.body && typeof r.body === 'object' && 'data' in r.body ? r.body.data : r.body;
function assert(cond, msg) { if (!cond) throw new Error(`assert: ${msg}`); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForEvent(socket, name, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), timeoutMs);
    socket.once(name, (payload) => { clearTimeout(t); resolve(payload); });
  });
}
async function connect(token) {
  const sock = io(`${ORIGIN}/chat`, { auth: { token }, transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    sock.once('connect', () => { clearTimeout(t); resolve(); });
    sock.once('connect_error', (e) => { clearTimeout(t); reject(e); });
  });
  return sock;
}

(async () => {
  let aId, bId, sockA, sockB;
  try {
    const a = await supa.auth.admin.createUser({
      email: A_EMAIL, password: PASSWORD, email_confirm: true,
      user_metadata: { role: 'athlete', name: 'DM A' },
    });
    if (a.error) throw new Error(`createUser A: ${a.error.message}`);
    aId = a.data.user.id;
    const b = await supa.auth.admin.createUser({
      email: B_EMAIL, password: PASSWORD, email_confirm: true,
      user_metadata: { role: 'recruiter', name: 'DM B' },
    });
    if (b.error) throw new Error(`createUser B: ${b.error.message}`);
    bId = b.data.user.id;
    await supa.from('users').update({ role: 'athlete', is_onboarded: true }).eq('id', aId);
    await supa.from('users').update({ role: 'recruiter', is_onboarded: true }).eq('id', bId);

    const loginA = await api('POST', '/auth/login', null, { email: A_EMAIL, password: PASSWORD });
    const loginB = await api('POST', '/auth/login', null, { email: B_EMAIL, password: PASSWORD });
    assert(loginA.status === 201 && loginB.status === 201, 'login both');
    const tokenA = loginA.body.data.accessToken;
    const tokenB = loginB.body.data.accessToken;

    // user search: B should find A by name fragment
    const search = await api('GET', `/users/search?q=DM%20A&limit=5`, tokenB);
    assert(search.status === 200, `search status ${search.status}`);
    const found = unwrap(search).find((u) => u.id === aId);
    assert(!!found, 'B can find A via search');
    console.log('SEARCH OK  B found A');

    // A get-or-create conversation with B
    const created = await api('POST', '/conversations', tokenA, { userId: bId });
    assert(created.status === 201, `create ${created.status} ${JSON.stringify(created.body)}`);
    const convId = unwrap(created).id;
    console.log('CONV     id=', convId);

    // get-or-create is idempotent: B does it too, same id
    const created2 = await api('POST', '/conversations', tokenB, { userId: aId });
    assert(unwrap(created2).id === convId, 'idempotent get-or-create');

    sockA = await connect(tokenA);
    sockB = await connect(tokenB);
    sockA.on('error', (e) => console.log('[A error]', JSON.stringify(e)));
    sockB.on('error', (e) => console.log('[B error]', JSON.stringify(e)));
    sockA.emit('join_conversation', { conversationId: convId });
    sockB.emit('join_conversation', { conversationId: convId });
    await wait(150);

    // WS path: A send_dm -> B receives new_dm
    const wsRecv = waitForEvent(sockB, 'new_dm', 3000);
    sockA.emit('send_dm', { conversationId: convId, text: 'hi over WS' });
    const wsMsg = await wsRecv;
    assert(wsMsg?.text === 'hi over WS', `ws text: ${JSON.stringify(wsMsg)}`);
    assert(wsMsg?.senderId === aId, 'ws senderId');
    console.log('WS OK    B got new_dm:', wsMsg.text);

    // REST path: A POST /conversations/:id/messages -> B receives broadcast
    const restRecv = waitForEvent(sockB, 'new_dm', 3000);
    const restSend = await api('POST', `/conversations/${convId}/messages`, tokenA, { text: 'hi over REST' });
    assert(restSend.status === 201, `rest send ${restSend.status} ${JSON.stringify(restSend.body)}`);
    const restMsg = await restRecv;
    assert(restMsg?.text === 'hi over REST', `rest text: ${JSON.stringify(restMsg)}`);
    console.log('REST OK  B got new_dm:', restMsg.text);

    // Inbox for B: shows conv with lastMessage + unreadCount 2
    const inbox = unwrap(await api('GET', '/conversations', tokenB));
    const conv = inbox.find((c) => c.id === convId);
    assert(conv, 'inbox includes conv');
    assert(conv.lastMessage === 'hi over REST', `lastMessage: ${conv.lastMessage}`);
    assert(conv.unreadCount === 2, `unreadCount: ${conv.unreadCount}`);
    console.log('INBOX OK lastMessage="hi over REST" unreadCount=2');

    // B marks read; unread drops
    const mark = await api('PUT', `/conversations/${convId}/read`, tokenB);
    assert(mark.status === 200, `mark read ${mark.status}`);
    const inbox2 = unwrap(await api('GET', '/conversations', tokenB));
    const conv2 = inbox2.find((c) => c.id === convId);
    assert(conv2.unreadCount === 0, `unreadCount after read: ${conv2.unreadCount}`);
    console.log('READ OK  unreadCount=0');

    console.log('\nSMOKE OK  open DMs end-to-end (search + get-or-create + WS + REST + inbox + read)');
  } catch (e) {
    console.error('\nSMOKE FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    try { sockA?.disconnect(); } catch {}
    try { sockB?.disconnect(); } catch {}
    if (aId) await supa.auth.admin.deleteUser(aId);
    if (bId) await supa.auth.admin.deleteUser(bId);
    console.log('cleanup OK (temp users removed)');
  }
})();
