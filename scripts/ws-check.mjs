#!/usr/bin/env node
//
// Smoke-test the chat websocket against a deployed backend.
//
//   node scripts/ws-check.mjs <token-file> [baseUrl]
//
// Checks two things that unit tests cannot: that a real authenticated
// socket completes the handshake against the live gateway, and that an
// unauthenticated one is refused. The second matters more — the gateway
// runs its own auth (it does not go through JwtAuthGuard), so a regression
// there would open every conversation to anyone who can reach the server,
// and nothing else in the test suite would notice.
//
// Lives in scripts/ rather than backend/ so `socket.io-client` resolves:
// Node walks up from the file's directory, and the client is installed in
// the app's root node_modules, not the backend's.

import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const tokenFile = process.argv[2];
const base =
  process.argv[3] ?? 'https://getdraft-api-production.up.railway.app';

if (!tokenFile) {
  console.error('usage: node scripts/ws-check.mjs <token-file> [baseUrl]');
  process.exit(2);
}

const token = readFileSync(tokenFile, 'utf8').trim();
const url = `${base}/chat`; // gateway namespace
const OPTS = { transports: ['websocket'], timeout: 20000, reconnection: false };

let failed = false;
const done = (code) => process.exit(code);

const authed = io(url, { ...OPTS, auth: { token } });

authed.on('connect', () => {
  console.log(`authenticated socket : CONNECTED (${authed.id})`);

  const anon = io(url, OPTS);

  const finish = () => {
    anon.close();
    authed.close();
    done(failed ? 1 : 0);
  };

  anon.on('connect', () => {
    console.log('unauthenticated      : CONNECTED  <-- SECURITY HOLE');
    failed = true;
    finish();
  });
  anon.on('connect_error', (e) => {
    console.log(`unauthenticated      : refused ("${e.message}") - correct`);
    finish();
  });
});

authed.on('connect_error', (e) => {
  console.log(`authenticated socket : FAILED - ${e.message}`);
  done(1);
});

setTimeout(() => {
  console.log('timed out after 25s with no handshake');
  done(1);
}, 25000);
