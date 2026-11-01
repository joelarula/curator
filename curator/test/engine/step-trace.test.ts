import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, type TestEnv } from '../helpers/harness.ts';
import { EXTERNAL_DATABASES, externalEnv, closeExternalDatabases } from '../helpers/externalDb.ts';
import { clearRequestContexts } from '../../src/engine/Retention.ts';
import { StepTraceWriter } from '../../src/engine/StepTrace.ts';

const canned = { echo: (a: any) => ({ echoed: a.text }) };
const flow = {
  type: 'Curator_Sequential',
  name: 'mixed',
  subAgents: [
    { type: 'Curator_SetState', state: { greeting: 'hi' } },
    { type: 'Curator_Tool', toolName: 'echo', args: { text: '$state.greeting' } },
  ],
};

// StepTrace has a composite primary key on Postgres/MariaDB: real servers too when the env vars are set
const TARGETS: Array<[string, (name: string, options?: any) => Promise<TestEnv>]> = [
  ['sqlite', (name, options) => createEnv(name, canned, options)],
  ...EXTERNAL_DATABASES.map((db): [string, (name: string, options?: any) => Promise<TestEnv>] => [db.name, (_name, options) => externalEnv(db, canned, options)]),
];
test.after(closeExternalDatabases);

const nodeTypeOf = (r: any) => (typeof r.ast === 'string' ? JSON.parse(r.ast) : r.ast)?.type;

for (const [target, makeEnv] of TARGETS) {
  test(`step trace (${target}): control-flow results are Request.output, history results stay Responses`, async () => {
    const env = await makeEnv('trace_split');
    try {
      const { result } = await runAst(env, flow);
      assert.equal(result.done, true);
      const requests = await env.prisma.request.findMany({ include: { responses: true }, orderBy: { id: 'asc' } });
      const setState = requests.find((r: any) => nodeTypeOf(r) === 'Curator_SetState');
      const tool = requests.find((r: any) => nodeTypeOf(r) === 'Curator_Tool');
      assert.match(setState.output, /State updated/);
      assert.equal(setState.responses.length, 0, 'no Response row for a control-flow step');
      assert.equal(tool.output, null);
      assert.deepEqual(tool.responses.map((r: any) => JSON.parse(r.content)), [{ echoed: 'hi' }], 'the state reached the next step');

      await env.processor.idle(); // flushes the trace buffer
      const trace = await env.prisma.stepTrace.findMany({ orderBy: { id: 'asc' } });
      assert.deepEqual(trace.map((t: any) => t.requestId).sort(), requests.map((r: any) => r.id).sort(), 'one row per finished request');
      const traced = (id: number) => trace.find((t: any) => t.requestId === id);
      assert.equal(traced(setState.id).nodeType, 'Curator_SetState');
      assert.equal(traced(setState.id).status, 'COMPLETED');
      assert.match(traced(setState.id).output, /State updated/);
      assert.equal(traced(tool.id).output, null, 'a history step keeps its result in its Response only');
      assert.ok(traced(tool.id).startedAt instanceof Date);
    } finally {
      await env.cleanup();
    }
  });

  test(`step trace (${target}): retention trims output with context; old trace rows are pruned`, async () => {
    const env = await makeEnv('trace_retention');
    try {
      await runAst(env, flow);
      await env.processor.idle();
      const ids = (await env.prisma.request.findMany({ select: { id: true } })).map((r: any) => r.id);
      await clearRequestContexts(env.prisma, ids);
      assert.equal(await env.prisma.request.count({ where: { output: { not: null } } }), 0);

      const writer = new StepTraceWriter(env.prisma);
      const rows = await env.prisma.stepTrace.count();
      assert.ok(rows > 0);
      assert.equal(await writer.prune(new Date(0)), 0, 'nothing older than the epoch');
      assert.equal(await writer.prune(new Date(Date.UTC(2200, 0, 1))), rows);
    } finally {
      await env.cleanup();
    }
  });
}

test('step trace: off with stepTrace false; results still split', async () => {
  const env = await createEnv('trace_off', canned, { stepTrace: false });
  try {
    await runAst(env, flow);
    await env.processor.idle();
    assert.equal(await env.prisma.stepTrace.count(), 0);
    assert.ok(await env.prisma.request.findFirst({ where: { output: { not: null } } }));
  } finally {
    await env.cleanup();
  }
});
