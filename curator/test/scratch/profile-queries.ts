// Counts Prisma operations per request for the load-test flow shape (temporary profiling, not a test).
// TRACE_OP=Model.operation also tallies the call sites of that operation.
import { createEnv, runAst } from '../helpers/harness.ts';

const env = await createEnv('profile_queries', { echo: (a: any) => ({ echoed: a.text }) });
const counts = new Map<string, number>();
const sites = new Map<string, number>();
const SRC = /[\\/]curator[\\/]src[\\/]/;
// A Proxy over the model delegates: the methods are called synchronously, so the caller's stack is intact
const record = (key: string) => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
  if (process.env.TRACE_OP !== key) return;
  const frames = (new Error().stack ?? '')
    .split('\n')
    .filter(l => SRC.test(l) && !l.includes('generated'))
    .slice(0, 3)
    .map(l => l.trim().split(SRC)[1]?.replace(/\)$/, ''))
    .join(' <- ');
  sites.set(frames, (sites.get(frames) ?? 0) + 1);
};
const raw: any = env.prisma;
const counted = new Proxy(raw, {
  get(target, prop: string) {
    const value = target[prop];
    if (typeof prop === 'string' && prop.startsWith('$') && typeof value === 'function') {
      return (...args: any[]) => { record(`raw.${prop}`); return value.apply(target, args); };
    }
    if (!value || typeof value !== 'object' || typeof value.findMany !== 'function') return value;
    const model = prop.charAt(0).toUpperCase() + prop.slice(1);
    return new Proxy(value, {
      get(delegate, op: string) {
        const fn = delegate[op];
        return typeof fn === 'function' ? (...args: any[]) => { record(`${model}.${op}`); return fn.apply(delegate, args); } : fn;
      },
    });
  },
});
const p: any = env.processor;
p.prisma = counted;
p.store.prisma = counted;
if (p.trace) p.trace.prisma = counted;
p.maintenanceContext.prisma = counted;
p.nodeContext.prisma = counted;

const step = (name: string) => ({ type: 'Curator_Tool', toolName: 'echo', args: { text: name } });
const flow = { type: 'Curator_Sequential', name: 'load', subAgents: [step('s0'), { type: 'Curator_Parallel', name: 'fan', subAgents: [step('p0'), step('p1')] }, step('s1'), step('s2'), step('s3'), step('s4')] };
await runAst(env, flow);
const requests = await env.prisma.request.count();
const total = [...counts.values()].reduce((a, b) => a + b, 0);
console.log(`requests ${requests}, operations ${total}, per request ${(total / requests).toFixed(1)}`);
for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(5)}  ${k}`);
for (const [k, v] of [...sites].sort((a, b) => b[1] - a[1])) console.log(`SITE ${v}  ${k}`);
await env.cleanup();
