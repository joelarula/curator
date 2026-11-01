// Load test (docs/DISTRIBUTED_STORAGE_PLAN.md): several host processes (scripts/smoke-node.ts) on one throwaway
// Postgres or MariaDB database run many conversations at once. Reports throughput, the delay between a step's end
// and the next step's start, conversation durations, connections held, and checks that every step ran exactly once
// and that no conversation ran on two nodes at a time.
//
//   npm --prefix curator run build && npm --prefix packages/host run build
//   SMOKE_SERVER_URL=postgresql://curator_test:curator_test@<host>:55432/postgres node packages/host/scripts/load-test.ts
//
// LOAD_NODES (default 3), LOAD_CONVERSATIONS (100), LOAD_STEPS sequential steps per flow (5, plus a 2-way parallel
// step), LOAD_STEP_MS tool duration (20), SMOKE_INTERVAL_MS poll interval (100). Each flow is
// Sequential[s0, Parallel[p0, p1], s1 .. s(N-1)].
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@curator/agent-server';

const here = path.dirname(fileURLToPath(import.meta.url));
const NODES = Number(process.env.LOAD_NODES ?? 3);
const CONVERSATIONS = Number(process.env.LOAD_CONVERSATIONS ?? 100);
const STEPS = Number(process.env.LOAD_STEPS ?? 5);
const STEP_MS = Number(process.env.LOAD_STEP_MS ?? 20);
const events: any[] = [];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (...a: any[]) => console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...a);

interface LoadNode {
  name: string;
  proc: ChildProcess;
  send(cmd: any): void;
}

function startNode(name: string, dbUrl: string): LoadNode {
  const url = `${dbUrl}${dbUrl.includes('?') ? '&' : '?'}application_name=${name}`;
  const proc = spawn(process.execPath, ['--no-warnings', path.join(here, 'smoke-node.ts')], {
    env: { ...process.env, SMOKE_NODE: name, SMOKE_DB_URL: url, SMOKE_DURABILITY: 'durable' },
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
  return { name, proc, send: cmd => proc.stdin!.write(JSON.stringify(cmd) + '\n') };
}

const exited = (n: LoadNode) => n.proc.exitCode != null || n.proc.signalCode != null;
async function stopNodes(nodes: LoadNode[]) {
  for (const n of nodes) if (!exited(n)) n.send({ cmd: 'stop' });
  await Promise.all(nodes.map(n => (exited(n) ? null : new Promise(r => n.proc.once('exit', r)))));
}
async function waitFor<T>(what: string, fn: () => T | undefined | false, timeoutMs: number): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > until) throw new Error(`timeout waiting for ${what}`);
    await sleep(50);
  }
}
const pct = (values: number[], p: number) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const dist = (values: number[]) => `p50 ${pct(values, 50)}ms  p95 ${pct(values, 95)}ms  p99 ${pct(values, 99)}ms  max ${pct(values, 100)}ms`;

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
const postgres = db.url.startsWith('postgres');
log(`test database ${db.name}: ${NODES} nodes, ${CONVERSATIONS} conversations x ${STEPS + 2} steps of ${STEP_MS}ms`);

// Connections to the test database (all nodes plus this script), sampled while the flows run
const connections = async (): Promise<number> => {
  const sql = postgres
    ? `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = '${db.name}'`
    : `SELECT count(*) AS n FROM information_schema.PROCESSLIST WHERE DB = '${db.name}'`;
  const rows: any[] = await prisma.$queryRawUnsafe(sql);
  return Number(rows[0]?.n ?? 0);
};

let nodes: LoadNode[] = [];
try {
  const systemUser =
    (await prisma.user.findFirst({ where: { OR: [{ email: 'system@local' }, { id: 'system' }] } })) ??
    (await prisma.user.create({ data: { id: 'system', name: 'System User', email: 'system@local' } }));
  await prisma.project.upsert({ where: { id: '1' }, update: {}, create: { id: '1', name: 'load', userId: systemUser.id } });
  await prisma.role.upsert({ where: { id: 'admin' }, update: {}, create: { id: 'admin', name: 'admin' } });
  await prisma.userRole.create({ data: { userId: systemUser.id, roleId: 'admin' } });

  // Started one after the other: each host's startup seeds rows the next one reuses
  let ready: any;
  for (let i = 0; i < NODES; i++) {
    const name = `N${i + 1}`;
    nodes.push(startNode(name, db.url));
    ready = await waitFor(`${name} ready`, () => events.find(e => e.node === name && e.ev === 'ready'), 120_000);
  }
  const { userId, projectId } = ready;
  const idleConnections = await connections();

  const step = (conv: number, name: string) => ({ type: 'Curator_Tool', toolName: 'slow_step', args: { conv, step: name, ms: STEP_MS } });
  const flow = (conv: number) => ({
    type: 'Curator_Sequential',
    name: 'load',
    subAgents: [
      step(conv, 's0'),
      { type: 'Curator_Parallel', name: 'fan', subAgents: [step(conv, 'p0'), step(conv, 'p1')] },
      ...Array.from({ length: STEPS - 1 }, (_, i) => step(conv, `s${i + 1}`)),
    ],
  });
  const convs: number[] = [];
  for (let c = 0; c < CONVERSATIONS; c++) convs.push((await prisma.conversation.create({ data: { userId, projectId } })).id);
  const convSet = new Set(convs);
  const total = CONVERSATIONS * (STEPS + 2);

  const queuedAt = Date.now();
  await prisma.request.createMany({
    data: convs.map(conversationId => ({ userId, projectId, conversationId, status: 'NEW', toolName: 'Curator_Workflow', ast: flow(conversationId), scheduledAt: new Date() })),
  });
  // As hosts do for new work (announce()): Postgres nodes hear it at once, MariaDB nodes at their next poll
  if (postgres) await prisma.$executeRawUnsafe(`SELECT pg_notify('curator_wake', 'load-test')`);
  log(`queued ${CONVERSATIONS} flows (${total} tool steps)`);

  let peakConnections = 0;
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      peakConnections = Math.max(peakConnections, await connections().catch(() => 0));
      await sleep(500);
    }
  })();
  const ends = () => events.filter(e => e.ev === 'end' && convSet.has(e.conv));
  // Gives up when no step has finished for 30s (lease takeovers take 30s, so a stall past that is stuck work)
  let lastReport = Date.now();
  let lastProgress = { at: Date.now(), done: 0 };
  await waitFor(
    'all steps done',
    () => {
      const done = ends().length;
      if (done > lastProgress.done) lastProgress = { at: Date.now(), done };
      if (Date.now() - lastReport > 5000) {
        lastReport = Date.now();
        log(`${done}/${total} steps done`);
      }
      if (Date.now() - lastProgress.at > 30_000) throw new Error('no progress for 30s');
      return done >= total;
    },
    Math.max(120_000, total * 200)
  ).catch(err => check('all steps finished', false, `${ends().length}/${total}: ${err.message}`));
  const wallMs = (ends().length >= total ? Date.now() : lastProgress.at) - queuedAt;
  sampling = false;
  await sampler;

  const starts = events.filter(e => e.ev === 'start' && convSet.has(e.conv));
  const endEvents = ends();
  const keys = starts.map(s => `${s.conv}/${s.step}`);
  check('every step ran exactly once', starts.length === total && new Set(keys).size === total, `${starts.length} starts, ${new Set(keys).size} distinct, ${total} expected`);

  let overlaps = 0;
  const gaps: number[] = [];
  const gapsByStep: Record<string, number[]> = {};
  const durations: number[] = [];
  for (const conv of convs) {
    const spans = starts
      .filter(s => s.conv === conv)
      .map(s => ({ node: s.node, step: s.step, from: s.t, to: endEvents.find(e => e.conv === conv && e.step === s.step)?.t ?? s.t }))
      .sort((x, y) => x.from - y.from);
    for (const x of spans) for (const y of spans) if (x.node < y.node && x.from < y.to && y.from < x.to) overlaps++;
    // Engine overhead: from a sequential step's end (the parallel step's last branch) to the next step's start
    const at = (name: string) => spans.find(s => s.step === name);
    const order = ['s0', 'fan', ...Array.from({ length: STEPS - 1 }, (_, i) => `s${i + 1}`)];
    for (let i = 1; i < order.length; i++) {
      const prevEnd = order[i - 1] === 'fan' ? Math.max(at('p0')?.to ?? NaN, at('p1')?.to ?? NaN) : at(order[i - 1])?.to;
      const nextStart = order[i] === 'fan' ? Math.min(at('p0')?.from ?? NaN, at('p1')?.from ?? NaN) : at(order[i])?.from;
      if (prevEnd != null && nextStart != null && !Number.isNaN(prevEnd) && !Number.isNaN(nextStart)) {
        gaps.push(nextStart - prevEnd);
        (gapsByStep[`${order[i - 1]}->${order[i]}`] ??= []).push(nextStart - prevEnd);
      }
    }
    const last = spans.at(-1);
    if (last) durations.push(last.to - queuedAt);
  }
  check('no conversation ran on two nodes at once', overlaps === 0, `${overlaps} overlapping spans`);

  const statuses = await prisma.request.groupBy({ by: ['status'], where: { conversationId: { in: convs } }, _count: true });
  const statusText = statuses.map((s: any) => `${s.status}: ${s._count}`).join(', ');
  const notDone = statuses.filter((s: any) => s.status !== 'COMPLETED').reduce((n: number, s: any) => n + s._count, 0);
  check('every request completed', notDone === 0, statusText);
  if (notDone) {
    const stuck = await prisma.request.findMany({
      where: { conversationId: { in: convs }, status: { not: 'COMPLETED' } },
      select: { id: true, conversationId: true, status: true, pendingDependencies: true, lockedBy: true, notifyId: true, ast: true, createdAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    for (const r of stuck) {
      const ast = typeof r.ast === 'string' ? JSON.parse(r.ast) : r.ast;
      log(`  stuck #${r.id} conv ${r.conversationId} ${ast?.type}${ast?.args?.step ? `(${ast.args.step})` : ''} ${r.status} pd=${r.pendingDependencies} lock=${r.lockedBy} notify=${r.notifyId}`);
    }
    const leases = await prisma.conversationLease.findMany({ where: { conversationId: { in: [...new Set(stuck.map((r: any) => r.conversationId))] } } });
    for (const l of leases) log(`  lease conv ${l.conversationId} owner ${l.owner} until ${new Date(l.leaseUntil).toISOString()}`);
  }

  // Trace rows are flushed each tick: give the nodes a moment, then compare with the finished requests
  await sleep(1000);
  const requestCount = await prisma.request.count({ where: { conversationId: { in: convs } } });
  const traceCount = await prisma.stepTrace.count({ where: { conversationId: { in: convs } } });
  check('every finished request is in StepTrace', traceCount === requestCount, `${traceCount} trace rows, ${requestCount} requests`);

  const byNode = Object.entries(Object.groupBy(starts, (s: any) => s.node)).map(([n, s]) => `${n}: ${s!.length}`).join(', ');
  console.log('\nLOAD');
  console.log(`  wall time           ${(wallMs / 1000).toFixed(1)}s for ${total} tool steps (${requestCount} requests)`);
  console.log(`  throughput          ${(total / (wallMs / 1000)).toFixed(1)} tool steps/s, ${(requestCount / (wallMs / 1000)).toFixed(1)} requests/s`);
  console.log(`  step-to-step delay  ${dist(gaps)}`);
  for (const [transition, values] of Object.entries(gapsByStep)) console.log(`    ${transition.padEnd(16)}${dist(values)}`);
  console.log(`  flow duration       ${dist(durations)} (from queueing)`);
  console.log(`  steps per node      ${byNode}`);
  console.log(`  connections         ${idleConnections} idle, ${peakConnections} peak`);

  if (process.env.LOAD_TIMELINE) {
    // The slowest flow request by request (StepTrace: start and finish of each, ms from queueing)
    const slowest = convs[durations.indexOf(Math.max(...durations))];
    const trace = await prisma.stepTrace.findMany({ where: { conversationId: slowest }, orderBy: { id: 'asc' } });
    const requests = await prisma.request.findMany({ where: { conversationId: slowest }, select: { id: true, createdAt: true } });
    const createdAt = new Map(requests.map((r: any) => [r.id, new Date(r.createdAt).getTime()]));
    console.log(`\nTIMELINE conversation ${slowest} (ms from queueing: created / started / finished)`);
    for (const t of trace) {
      const ms = (d: any) => (d ? String(new Date(d).getTime() - queuedAt).padStart(6) : '     -');
      console.log(`  #${String(t.requestId).padEnd(6)} ${String(t.nodeType).padEnd(20)} ${ms(createdAt.get(t.requestId))} ${ms(t.startedAt)} ${ms(t.createdAt)}  ${t.worker}`);
    }
  }
} catch (err: any) {
  check('run completed', false, err?.message ?? String(err));
  log('last events:', JSON.stringify(events.slice(-10)));
} finally {
  await stopNodes(nodes);
  await db.drop();
  log(`dropped ${db.name}`);
  console.log('\nSUMMARY');
  for (const [name, ok, detail] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  process.exit(results.length > 0 && results.every(r => r[1]) ? 0 : 1);
}
