/**
 * Realtime chat smoke: 2 throwaway users -> match -> 2 socket clients ->
 * A sends 'send_message' -> assert B receives 'new_message'. REST send by
 * A also verified to broadcast to B. Cleans up the users.
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
const A_EMAIL = `chatA+${TS}@getdraft.app`;
const B_EMAIL = `chatB+${TS}@getdraft.app`;
const PASSWORD = 'GetDraft2026!';

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForEvent(socket, name, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timeout waiting for ${name}`)),
      timeoutMs,
    );
    socket.once(name, (payload) => { clearTimeout(t); resolve(payload); });
  });
}

async function connect(token) {
  const sock = io(`${ORIGIN}/chat`, {
    auth: { token },
    transports: ['websocket'],
  });
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
      user_metadata: { role: 'athlete', name: 'Chat A' },
    });
    if (a.error) throw new Error(`createUser A: ${a.error.message}`);
    aId = a.data.user.id;
    const b = await supa.auth.admin.createUser({
      email: B_EMAIL, password: PASSWORD, email_confirm: true,
      user_metadata: { role: 'recruiter', name: 'Chat B' },
    });
    if (b.error) throw new Error(`createUser B: ${b.error.message}`);
    bId = b.data.user.id;
    await supa.from('users').update({ role: 'athlete', is_onboarded: true }).eq('id', aId);
    await supa.from('users').update({ role: 'recruiter', is_onboarded: true }).eq('id', bId);

    // Matches has CHECK (user_1_id < user_2_id) — canonicalize.
    const [u1, u2] = aId < bId ? [aId, bId] : [bId, aId];
    const { data: match, error: matchErr } = await supa
      .from('matches')
      .insert({ user_1_id: u1, user_2_id: u2, is_active: true })
      .select('id')
      .single();
    if (matchErr) throw new Error(`match insert: ${matchErr.message}`);
    const matchId = match.id;

    const loginA = await api('POST', '/auth/login', null, { email: A_EMAIL, password: PASSWORD });
    const loginB = await api('POST', '/auth/login', null, { email: B_EMAIL, password: PASSWORD });
    assert(loginA.status === 201 && loginB.status === 201, 'login both');
    const tokenA = loginA.body.data.accessToken;
    const tokenB = loginB.body.data.accessToken;

    sockA = await connect(tokenA);
    sockB = await connect(tokenB);
    sockA.on('error', (e) => console.log('[A error]', JSON.stringify(e)));
    sockB.on('error', (e) => console.log('[B error]', JSON.stringify(e)));
    console.log('CONNECT  both sockets up');

    sockA.emit('join_thread', { matchId });
    sockB.emit('join_thread', { matchId });
    await wait(150);

    // ---- WS path: A emits send_message -> B receives new_message ----
    const wsRecv = waitForEvent(sockB, 'new_message', 3000);
    sockA.emit('send_message', { matchId, text: 'hello over WS' });
    const wsMsg = await wsRecv;
    assert(wsMsg?.text === 'hello over WS', `ws text: ${JSON.stringify(wsMsg)}`);
    assert(wsMsg?.senderId === aId, `ws senderId`);
    console.log('WS OK    B got new_message:', wsMsg.text);

    // ---- REST path: A POSTs message -> B (still in room) gets broadcast ----
    const restRecv = waitForEvent(sockB, 'new_message', 3000);
    const restSend = await api('POST', `/chat/threads/${matchId}/messages`, tokenA, { text: 'hello over REST' });
    assert(restSend.status === 201, `rest send ${restSend.status}`);
    const restMsg = await restRecv;
    assert(restMsg?.text === 'hello over REST', `rest text: ${JSON.stringify(restMsg)}`);
    assert(restMsg?.senderId === aId, 'rest senderId');
    console.log('REST OK  B got new_message:', restMsg.text);

    console.log('\nSMOKE OK  realtime chat works (WS path + REST broadcast)');
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
