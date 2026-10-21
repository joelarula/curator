#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const keerisRoot = dirname(__dirname);

// Load .env files
const envCandidates = [
  join(keerisRoot, '.env'),
  join(keerisRoot, '.env.local'),
  join(keerisRoot, '.env.production'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
      break;
    } catch (_) {}
  }
}

// Parse args
const args = process.argv.slice(2);
function getArg(flags, fallback) {
  for (let i = 0; i < args.length; i++) {
    if (flags.includes(args[i])) return args[i + 1];
    for (const f of flags) {
      if (args[i].startsWith(`${f}=`)) return args[i].slice(f.length + 1);
    }
  }
  return fallback;
}

const targetHost = getArg(['--host', '-h'], process.env.REMOTE_HOST || '192.168.1.110');
const httpPort = Number(getArg(['--port', '-p'], process.env.PORT || '4001'));
const dbUrl = getArg(['--db', '-d'], process.env.DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/keeris');
const timeoutMs = Number(getArg(['--timeout', '-t'], '3000'));

console.log('\n\x1b[1m\x1b[36m====================================================\x1b[0m');
console.log('\x1b[1m\x1b[36m   🔍 Curator Keeris Remote Docker Test Suite\x1b[0m');
console.log('\x1b[1m\x1b[36m====================================================\x1b[0m');
console.log(`Target Host:  \x1b[33m${targetHost}\x1b[0m`);
console.log(`HTTP Port:    \x1b[33m${httpPort}\x1b[0m`);
console.log(`Database URL: \x1b[33m${dbUrl.replace(/:[^:@]+@/, ':****@')}\x1b[0m\n`);

async function testTcp(host, port, name) {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const ms = Date.now() - start;
      console.log(`  ✔ \x1b[32mTCP ${name}\x1b[0m (${host}:${port}): \x1b[32mOPEN\x1b[0m in ${ms}ms`);
      resolve({ ok: true, ms });
    });

    const onFail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const ms = Date.now() - start;
      console.log(`  ✖ \x1b[31mTCP ${name}\x1b[0m (${host}:${port}): \x1b[31m${err.message || 'CLOSED/TIMEOUT'}\x1b[0m in ${ms}ms`);
      resolve({ ok: false, error: err.message });
    };

    socket.on('timeout', () => onFail(new Error('Connection timed out')));
    socket.on('error', onFail);

    try {
      socket.connect(port, host);
    } catch (e) {
      onFail(e);
    }
  });
}

async function testHttpHealth(baseUrl) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    const ms = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      console.log(`  ✔ \x1b[32mHTTP Health\x1b[0m (${baseUrl}/health): \x1b[32mHTTP ${res.status}\x1b[0m (${data.database || 'db'}, ${data.episodes || 0} episodes, processor: ${data.processor || 'ready'}) in ${ms}ms`);
      return { ok: true, data };
    } else {
      console.log(`  ✖ \x1b[31mHTTP Health\x1b[0m (${baseUrl}/health): \x1b[31mHTTP ${res.status} ${res.statusText}\x1b[0m`);
      return { ok: false };
    }
  } catch (err) {
    console.log(`  ✖ \x1b[31mHTTP Health\x1b[0m (${baseUrl}/health): \x1b[31m${err.message}\x1b[0m`);
    return { ok: false, error: err.message };
  }
}

async function testGraphQL(baseUrl) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `query { stats { episodes tracks uniqueTracks programs } }`,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - start;
    if (res.ok) {
      const payload = await res.json();
      if (payload.errors) {
        console.log(`  ✖ \x1b[31mGraphQL API\x1b[0m (${baseUrl}/graphql): \x1b[31mErrors: ${payload.errors.map(e => e.message).join(', ')}\x1b[0m`);
        return { ok: false };
      }
      const s = payload.data?.stats;
      console.log(`  ✔ \x1b[32mGraphQL API\x1b[0m (${baseUrl}/graphql): \x1b[32mOK\x1b[0m (${s?.episodes || 0} ep, ${s?.tracks || 0} airings, ${s?.uniqueTracks || 0} songs) in ${ms}ms`);
      return { ok: true, data: s };
    } else {
      console.log(`  ✖ \x1b[31mGraphQL API\x1b[0m (${baseUrl}/graphql): \x1b[31mHTTP ${res.status}\x1b[0m`);
      return { ok: false };
    }
  } catch (err) {
    console.log(`  ✖ \x1b[31mGraphQL API\x1b[0m (${baseUrl}/graphql): \x1b[31m${err.message}\x1b[0m`);
    return { ok: false, error: err.message };
  }
}

async function testWebSocket(baseUrl) {
  try {
    const { WebSocket } = await import('ws');
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/events';
    return await new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch (_) {}
        console.log(`  ✖ \x1b[31mWebSocket Stream\x1b[0m (${wsUrl}): \x1b[31mTimed out waiting for handshake\x1b[0m`);
        resolve({ ok: false });
      }, timeoutMs);

      ws.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch (_) {}
        console.log(`  ✔ \x1b[32mWebSocket Stream\x1b[0m (${wsUrl}): \x1b[32mConnected\x1b[0m`);
        resolve({ ok: true });
      });

      ws.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.log(`  ✖ \x1b[31mWebSocket Stream\x1b[0m (${wsUrl}): \x1b[31m${err.message}\x1b[0m`);
        resolve({ ok: false, error: err.message });
      });
    });
  } catch (err) {
    console.log(`  ✖ \x1b[31mWebSocket Stream\x1b[0m: \x1b[31m${err.message}\x1b[0m`);
    return { ok: false };
  }
}

async function testDatabase(url) {
  const start = Date.now();
  try {
    const { openDatabase } = await import('../src/db.ts');
    const db = openDatabase(url);
    const count = await db.prepare('SELECT COUNT(*) as count FROM unique_tracks').get();
    const ms = Date.now() - start;
    console.log(`  ✔ \x1b[32mDatabase Connection\x1b[0m: \x1b[32mConnected\x1b[0m (${count?.count || 0} unique tracks in DB) in ${ms}ms`);
    if (typeof db.close === 'function') await db.close();
    return { ok: true, count: count?.count };
  } catch (err) {
    console.log(`  ✖ \x1b[31mDatabase Connection\x1b[0m: \x1b[31m${err.message}\x1b[0m`);
    return { ok: false, error: err.message };
  }
}

async function main() {
  console.log('1. Testing Network Ports...');
  await testTcp(targetHost, httpPort, 'Server HTTP');
  await testTcp(targetHost, 4000, 'Alt HTTP (4000)');
  await testTcp(targetHost, 3306, 'MariaDB (3306)');
  await testTcp(targetHost, 5432, 'PostgreSQL (5432)');

  console.log('\n2. Testing HTTP & GraphQL Services...');
  const baseUrl = `http://${targetHost}:${httpPort}`;
  const baseUrlAlt = `http://${targetHost}:4000`;

  let httpResult = await testHttpHealth(baseUrl);
  if (!httpResult.ok) {
    httpResult = await testHttpHealth(baseUrlAlt);
  }

  const activeUrl = httpResult.ok ? (httpResult.data ? baseUrl : baseUrlAlt) : baseUrl;
  await testGraphQL(activeUrl);
  await testWebSocket(activeUrl);

  console.log('\n3. Testing Database Connection...');
  await testDatabase(dbUrl);

  console.log('\n====================================================');
  console.log('💡 Quick Tips:');
  console.log('  • To check remote docker containers via SSH:');
  console.log(`    powershell -File scripts/deploy-remote.ps1 -RemoteHost "joel@${targetHost}" -Action status`);
  console.log('  • To view remote container logs:');
  console.log(`    powershell -File scripts/deploy-remote.ps1 -RemoteHost "joel@${targetHost}" -Action logs -FollowLogs`);
  console.log('  • To run the CLI connected to this remote server:');
  console.log(`    node bin/keeris.mjs client --server ${activeUrl}`);
  console.log('====================================================\n');
}

main().catch(console.error);
