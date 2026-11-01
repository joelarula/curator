// Counts database operations per request on a real server (temporary profiling, not a test), including those
// inside transactions: CURATOR_TEST_POSTGRES_URL=... node --import tsx test/scratch/profile-pg.ts
// TRACE_OP=Model.operation also tallies its call sites.
import { externalEnv, closeExternalDatabases, EXTERNAL_DATABASES } from '../helpers/externalDb.ts';
import { runAst } from '../helpers/harness.ts';

const db = EXTERNAL_DATABASES.find(d => d.name === (process.env.PROFILE_DB ?? 'postgres'))!;
const env = await externalEnv(db, { echo: (a: any) => ({ echoed: a.text }) });
const counts = new Map<string, number>();
const sites = new Map<string, number>();
const SRC = /[\\/]curator[\\/]src[\\/]/;
const record = (key: string) => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
  return;
  const frames = (new Error().stack ?? '')
    .split('\n')
    .filter(l => SRC.test(l) && !l.includes('generated'))
    .slice(0, 4)
    .map(l => l.trim().split(SRC)[1]?.replace(/\)$/, ''))
    .join(' <- ');
  sites.set(frames, (sites.get(frames) ?? 0) + 1);
};
const raw: any = env.prisma;
const counted = (env.processor as any).prisma.$extends({
  query: {
    $allOperations({ model, operation, args, query }: any) {
      record(`${model ?? 'raw'}.${operation}`);
      return query(args);
    },
  },
});
// Interactive transactions: BEGIN and COMMIT are round trips of their own
const tx = counted.$transaction.bind(counted);
counted.$transaction = (fn: any, ...rest: any[]) => {
  if (typeof fn !== 'function') return tx(fn, ...rest);
  record('tx.begin+commit');
  return tx((t: any) => fn(traceProxy(t)), ...rest);
};
// Call sites need the caller's stack, so TRACE_OP is recorded by a synchronous proxy (top-level calls only)
const [traceModel, traceOp] = (process.env.TRACE_OP ?? '.').split('.');
const delegate = traceModel.charAt(0).toLowerCase() + traceModel.slice(1);
const traceProxy = (client: any): any => new Proxy(client, {
  get(target: any, prop: string) {
    const value = target[prop];
    if (prop !== delegate || !value) return value;
    return new Proxy(value, {
      get(d: any, op: string) {
        const fn = d[op];
        if (op !== traceOp || typeof fn !== 'function') return fn;
        return (...args: any[]) => {
          const frames = (new Error().stack ?? '').split('\n').filter(l => SRC.test(l)).slice(0, 4).map(l => l.trim().split(SRC)[1]?.replace(/\)$/, '')).join(' <- ');
          sites.set(frames, (sites.get(frames) ?? 0) + 1);
          return fn.apply(d, args);
        };
      },
    });
  },
});
const traced = traceProxy(counted);
const p: any = env.processor;
for (const holder of [p, p.store, p.trace, p.maintenanceContext, p.nodeContext]) if (holder?.prisma) holder.prisma = traced;
if (p.nodeContext) p.nodeContext.store = p.store;

const step = (name: string) => ({ type: 'Curator_Tool', toolName: 'echo', args: { text: name } });
const flow = { type: 'Curator_Sequential', name: 'load', subAgents: [step('s0'), { type: 'Curator_Parallel', name: 'fan', subAgents: [step('p0'), step('p1')] }, step('s1'), step('s2'), step('s3'), step('s4')] };
counts.clear();
await runAst(env, flow);
const requests = await raw.request.count();
const total = [...counts.values()].reduce((a, b) => a + b, 0);
console.log(`requests ${requests}, operations ${total}, per request ${(total / requests).toFixed(1)}`);
for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(5)}  ${k}`);
for (const [k, v] of [...sites].sort((a, b) => b[1] - a[1])) console.log(`SITE ${v}  ${k}`);
await closeExternalDatabases();
