// Two-node smoke run (docs/DISTRIBUTED_STORAGE_PLAN.md): host processes on one throwaway Postgres or MariaDB
// database, checking that one node runs a conversation at a time, that a killed node's conversation is taken over,
// and that a checkpoint host's conversation moves to the shared database and is resumed from another node.
//
//   npm --prefix curator run build && npm --prefix packages/host run build
//   SMOKE_SERVER_URL=postgresql://curator_test:curator_test@<host>:55432/postgres node packages/host/scripts/two-node-smoke.ts [exclusive] [kill] [checkpoint]
//
// SMOKE_SERVER_URL is a server URL (the test containers of curator/docker-compose.test.yml); the run creates its own
// curator_test_* database there and drops it at the end. SMOKE_ROUNDS repeats the checkpoint phase. SMOKE_AUDIT=1
// (Postgres only) logs every Request status change with node and statement when a step runs twice.
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@curator/agent-server';

const here = path.dirname(fileURLToPath(import.meta.url));
const phases = process.argv.slice(2).length ? process.argv.slice(2) : ['exclusive', 'kill', 'checkpoint'];
const events: any[] = [];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (...a: any[]) => console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...a);

interface SmokeNode {
  name: string;
  proc: ChildProcess;
  send(cmd: any): void;
}

function startNode(name: string, dbUrl: string, durability = 'durable'): SmokeNode {
  const url = `${dbUrl}${dbUrl.includes('?') ? '&' : '?'}application_name=${name}`;
  const proc = spawn(process.execPath, ['--no-warnings', path.join(here, 'smoke-node.ts')], {
    env: { ...process.env, SMOKE_NODE: name, SMOKE_DB_URL: url, SMOKE_DURABILITY: durability },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  proc.stdout!.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.startsWith('@@SMOKE ')) events.push(JSON.parse(line.slice(8)));
      else if (line.trim() && !line.includes('[CuratorEngine]')) process.stdout.write(`  [${name}] ${line}\n`);
    }
  });
  proc.stderr!.on('data', d => process.stderr.write(String(d).split('\n').filter(Boolean).map(l => `  [${name} stderr] ${l}\n`).join('')));
  proc.on('exit', (code, signal) => log(`${name} exited (${code ?? signal})`));
  return { name, proc, send: cmd => proc.stdin!.write(JSON.stringify(cmd) + '\n') };
}

async function waitFor<T>(what: string, fn: () => T | undefined | false, timeoutMs = 60_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > until) throw new Error(`timeout waiting for ${what}`);
    await sleep(50);
  }
}
const find = (p: (e: any) => boolean) => events.find(p);
const exited = (n: SmokeNode) => n.proc.exitCode != null || n.proc.signalCode != null;

async function stopNodes(...nodes: SmokeNode[]) {
  for (const n of nodes) if (!exited(n)) n.send({ cmd: 'stop' });
  await Promise.all(nodes.map(n => (exited(n) ? null : new Promise(r => n.proc.once('exit', r)))));
}

const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok, detail]);
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = process.env.SMOKE_SERVER_URL;
if (!server) {
  console.error('Set SMOKE_SERVER_URL to a Postgres or MariaDB server URL (see curator/docker-compose.test.yml)');
  process.exit(2);
}
const db = await createTestDatabase(server);
const prisma = db.prisma;
const audit = Boolean(process.env.SMOKE_AUDIT) && db.url.startsWith('postgres');
log(`test database ${db.name}`);

async function printAudit(conversationId: number) {
  if (!audit) return;
  const ids = (await prisma.request.findMany({ where: { conversationId }, select: { id: true } })).map((r: any) => r.id);
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT to_char(at, 'HH24:MI:SS.MS') AS at, id, old_status, new_status, old_pd, new_pd, locked_by, app, query FROM req_audit WHERE id = ANY($1::int[]) ORDER BY at`,
    ids
  );
  for (const a of rows) log(`  audit ${a.at} #${a.id} ${a.old_status}->${a.new_status} pd ${a.old_pd}->${a.new_pd} lock=${a.locked_by} node=${a.app} :: ${a.query}`);
}

try {
  // The hosts' system user with the admin role (tool access is whitelist-based); the hosts reuse these rows
  const systemUser =
    (await prisma.user.findFirst({ where: { OR: [{ email: 'system@local' }, { id: 'system' }] } })) ??
    (await prisma.user.create({ data: { id: 'system', name: 'System User', email: 'system@local' } }));
  await prisma.project.upsert({ where: { id: '1' }, update: {}, create: { id: '1', name: 'smoke', userId: systemUser.id } });
  await prisma.role.upsert({ where: { id: 'admin' }, update: {}, create: { id: 'admin', name: 'admin' } });
  await prisma.userRole.create({ data: { userId: systemUser.id, roleId: 'admin' } });
  if (audit) {
    // Debugging aid in the throwaway database only (not schema): Request status changes with node and statement
    await prisma.$executeRawUnsafe(`CREATE TABLE req_audit (at timestamptz, id int, old_status text, new_status text, old_pd int, new_pd int, locked_by text, app text, query text)`);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION req_audit_fn() RETURNS trigger AS $f$ BEGIN
      IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD."pendingDependencies" IS DISTINCT FROM NEW."pendingDependencies" OR OLD."lockedBy" IS DISTINCT FROM NEW."lockedBy" THEN
        INSERT INTO req_audit VALUES (clock_timestamp(), NEW.id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status::text END, NEW.status::text,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."pendingDependencies" END, NEW."pendingDependencies", NEW."lockedBy", current_setting('application_name'), left(regexp_replace(current_query(), '\\s+', ' ', 'g'), 220));
      END IF; RETURN NEW; END $f$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER req_audit_t AFTER INSERT OR UPDATE ON "Request" FOR EACH ROW EXECUTE FUNCTION req_audit_fn()`);
  }

  if (phases.includes('exclusive') || phases.includes('kill')) {
    // Started one after the other: each host's startup seeds rows the next one reuses
    const a = startNode('A', db.url);
    const ready = await waitFor('A ready', () => find(e => e.node === 'A' && e.ev === 'ready'), 120_000);
    const b = startNode('B', db.url);
    await waitFor('B ready', () => find(e => e.node === 'B' && e.ev === 'ready'), 120_000);
    const { userId, projectId } = ready;
    const conversation = async () => (await prisma.conversation.create({ data: { userId, projectId } })).id as number;
    const queue = (conversationId: number, ast: any) =>
      prisma.request.create({ data: { userId, projectId, conversationId, status: 'NEW', toolName: 'Curator_Workflow', ast, scheduledAt: new Date() } });
    const step = (conv: number, name: string, ms: number) => ({ type: 'Curator_Tool', toolName: 'slow_step', args: { conv, step: name, ms } });

    if (phases.includes('exclusive')) {
      log('--- exclusive: 8 conversations x 4 independent requests on two nodes');
      const convs: number[] = [];
      for (let c = 0; c < 8; c++) convs.push(await conversation());
      for (const conv of convs) for (let r = 0; r < 4; r++) await queue(conv, step(conv, `r${r}`, 150));
      const total = convs.length * 4;
      await waitFor('all steps done', () => events.filter(e => e.ev === 'end' && convs.includes(e.conv)).length >= total, 120_000);
      const ends = events.filter(e => e.ev === 'end' && convs.includes(e.conv));
      const starts = events.filter(e => e.ev === 'start' && convs.includes(e.conv));
      check('every request ran exactly once', starts.length === total && new Set(starts.map(s => `${s.conv}/${s.step}`)).size === total, `${starts.length} starts for ${total} requests`);
      const byNode = Object.groupBy(starts, (s: any) => s.node);
      check('both nodes did work', Object.keys(byNode).length === 2, Object.entries(byNode).map(([n, s]) => `${n}: ${s!.length}`).join(', '));
      // What leases must prevent: one conversation running on two nodes at the same time
      let overlaps = 0;
      for (const conv of convs) {
        const spans = starts.filter(s => s.conv === conv).map(s => ({ node: s.node, from: s.t, to: ends.find(e => e.conv === conv && e.step === s.step)!.t }));
        for (const x of spans) for (const y of spans) if (x.node < y.node && x.from < y.to && y.from < x.to) overlaps++;
      }
      check('no conversation ran on two nodes at once', overlaps === 0, `${overlaps} overlapping spans`);
    }

    if (phases.includes('kill')) {
      log('--- kill: one conversation of 6 sequential 1s steps; kill the node running it');
      const conv = await conversation();
      await queue(conv, { type: 'Curator_Sequential', name: 'long', subAgents: [0, 1, 2, 3, 4, 5].map(i => step(conv, `s${i}`, 1000)) });
      const first = await waitFor('first step', () => find(e => e.ev === 'start' && e.conv === conv));
      const [victim, survivor] = first.node === 'A' ? [a, b] : [b, a];
      await waitFor('second step', () => find(e => e.ev === 'start' && e.conv === conv && e.step === 's1'), 30_000);
      victim.proc.kill('SIGKILL');
      const killedAt = Date.now();
      log(`killed ${victim.name} during s1; ${survivor.name} should take over once the lease lapses (30s)`);
      const takeover = await waitFor('takeover', () => find(e => e.ev === 'start' && e.conv === conv && e.node === survivor.name), 120_000).catch(() => null);
      check('survivor took over the conversation', Boolean(takeover), takeover ? `${survivor.name} started ${takeover.step} ${((takeover.t - killedAt) / 1000).toFixed(1)}s after the kill` : 'not within 120s');
      if (takeover) {
        await waitFor('flow finished', () => find(e => e.ev === 'end' && e.conv === conv && e.step === 's5'), 60_000).catch(() => null);
        log(`steps: ${events.filter(e => e.ev === 'start' && e.conv === conv).map(e => `${e.node}:${e.step}`).join(' ')}`);
        check('flow finished after takeover', Boolean(find(e => e.ev === 'end' && e.conv === conv && e.step === 's5')));
      }
      const failed = await prisma.request.findMany({ where: { conversationId: conv, status: 'FAILED' }, select: { id: true, ast: true, responses: { select: { content: true } } } });
      for (const f of failed) log('failed request:', JSON.stringify(f).slice(0, 1500));
    }
    await stopNodes(a, b);
  }

  if (phases.includes('checkpoint')) {
    log('--- checkpoint: C starts a flow in memory, it moves at its human-input wait, D answers it');
    const c = startNode('C', db.url, 'checkpoint');
    await waitFor('C ready', () => find(e => e.node === 'C' && e.ev === 'ready'), 120_000);
    const d = startNode('D', db.url, 'checkpoint');
    await waitFor('D ready', () => find(e => e.node === 'D' && e.ev === 'ready'), 120_000);
    const step = (name: string) => ({ type: 'Curator_Tool', toolName: 'slow_step', args: { conv: '$CONV', step: name, ms: 100 } });
    const rounds = Number(process.env.SMOKE_ROUNDS ?? 1);
    for (let round = 1; round <= rounds; round++) {
      c.send({
        cmd: 'start',
        id: `cp${round}`,
        ast: {
          type: 'Curator_Sequential',
          name: 'ask',
          subAgents: [step('before'), { type: 'Curator_HumanInput', prompt: 'Pick', inputType: 'choices', choices: ['a', 'b'], as: 'selection' }, step('after')],
        },
      });
      const started = await waitFor('started', () => find(e => e.id === `cp${round}` && (e.ev === 'started' || e.ev === 'error')));
      if (started.ev === 'error') throw new Error(`start failed: ${started.message}`);
      const conv = started.conv;
      const before = await waitFor('before step', () => find(e => e.ev === 'start' && e.conv === conv && e.step === 'before'));
      check('flow started on C', before.node === 'C', `conversation ${conv}, first step on ${before.node}`);
      const moved = await waitFor('checkpoint', () => find(e => e.ev === 'checkpointed' && e.conv === conv), 30_000).catch(() => null);
      check('C moved the conversation to the shared database at its wait', Boolean(moved));
      const waiting = await prisma.request.count({ where: { conversationId: conv, status: 'WAITING_FOR_USER' } });
      check('the wait is durable', waiting === 1, `${waiting} WAITING_FOR_USER request(s)`);

      d.send({ cmd: 'emit', id: `answer${round}`, conv, event: 'curator:choice', payload: 'b' });
      const emitted = await waitFor('answer', () => find(e => e.id === `answer${round}` && (e.ev === 'emitted' || e.ev === 'error')));
      check('D accepted the answer', emitted.ev === 'emitted' && emitted.woken?.length > 0, emitted.ev === 'error' ? emitted.message : `woke ${emitted.woken}`);
      const after = await waitFor('after step', () => find(e => e.ev === 'end' && e.conv === conv && e.step === 'after'), 30_000).catch(() => null);
      const afterRuns = events.filter(e => e.ev === 'start' && e.conv === conv && e.step === 'after');
      check('the rest ran once, durable', Boolean(after) && afterRuns.length === 1, afterRuns.map(e => e.node).join(',') || 'never');
      if (afterRuns.length > 1) await printAudit(conv);
    }
    await stopNodes(c, d);
  }
} catch (err: any) {
  check('run completed', false, err?.message ?? String(err));
  log('request statuses:', JSON.stringify(await prisma.request.groupBy({ by: ['status'], _count: true }).catch(() => [])));
  log('last events:', JSON.stringify(events.slice(-10)));
} finally {
  await db.drop();
  log(`dropped ${db.name}`);
  console.log('\nSUMMARY');
  for (const [name, ok, detail] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  process.exit(results.length > 0 && results.every(r => r[1]) ? 0 : 1);
}
