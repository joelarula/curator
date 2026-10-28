import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, snapshotDb, assertGolden } from '../helpers/harness.ts';

const modules = {
  sequential: () => import('../fixtures/ast/sequential.ts'),
  parallel: () => import('../fixtures/ast/parallel.ts'),
  graph: () => import('../fixtures/ast/graph.ts'),
  router: () => import('../fixtures/ast/router.ts'),
  human_input: () => import('../fixtures/ast/human_input.ts'),
};

async function load(name: keyof typeof modules) {
  return (await modules[name]()).run();
}

// Responses of script nodes, order-independent (parallel children have no defined order).
const contents = (snap: any) => snap.responses.map((r: any) => String(r.content));

for (const name of ['sequential', 'parallel', 'router', 'graph'] as const) {
  test(`ast/${name}: runs to completion with deterministic DB state`, async () => {
    const env = await createEnv(`ast_${name}`);
    try {
      const { requestId, result } = await runAst(env, await load(name));
      assert.equal(result.done, true);
      const root = await env.prisma.request.findUnique({ where: { id: requestId } });
      assert.equal(root.status, 'COMPLETED');

      const snap = await snapshotDb(env);
      assert.ok(snap.requests.every((r: any) => r.status === 'COMPLETED'), 'every spawned request completed');
      assertGolden(`ast/${name}.db.json`, snap);
    } finally {
      await env.cleanup();
    }
  });
}

test('ast/router: takes the branch returned by the router script', async () => {
  const env = await createEnv('ast_router_branch');
  try {
    await runAst(env, await load('router'));
    const all = contents(await snapshotDb(env)).join('\n');
    assert.match(all, /took B/);
    assert.doesNotMatch(all, /took A/);
  } finally {
    await env.cleanup();
  }
});

test('ast/human_input: parks for input, resumes with the supplied value', async () => {
  const env = await createEnv('ast_human', { echo: (a: any) => ({ echoed: a.text }) });
  try {
    const { result } = await runAst(env, await load('human_input'));
    assert.equal(result.waiting, true);
    assert.equal(result.waitEvent, 'curator:choice');
    assert.equal(env.calls.length, 0);

    await env.processor.emitEventRequest({
      eventName: 'curator:choice',
      payload: 'CODE-42',
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    const resumed = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(resumed.done, true);
    assert.deepEqual(env.calls.map((c) => c.args.text), ['CODE-42']);
    assertGolden('ast/human_input.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('ast/choice: offers alternatives and resumes with the one selected', async () => {
  const env = await createEnv('ast_choice', { echo: (a: any) => ({ echoed: a.text }) });
  try {
    const { requestId, result } = await runAst(env, {
      type: 'Curator_Sequential',
      name: 'Choice Test',
      subAgents: [
        {
          type: 'Curator_HumanInput',
          prompt: 'Choose an option:',
          inputType: 'choices',
          choices: ['a', 'b', 'c'],
          as: 'selection',
        },
        {
          type: 'Curator_Tool',
          toolName: 'echo',
          args: { text: '$state.selection' },
        },
      ],
    });

    assert.equal(result.waiting, true);
    assert.equal(result.waitEvent, 'curator:choice');

    const waitingRequest = await env.prisma.request.findFirst({
      where: { conversationId: env.conversationId, status: 'WAITING_FOR_USER' },
    });
    assert.deepEqual(waitingRequest.context.activeChoices, [
      { id: 'a', label: 'a', value: 'a' },
      { id: 'b', label: 'b', value: 'b' },
      { id: 'c', label: 'c', value: 'c' },
    ]);

    await env.processor.emitEventRequest({
      eventName: 'curator:choice',
      payload: 'b',
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    const resumed = await env.processor.stepUntil({ conversationId: env.conversationId });

    assert.equal(resumed.done, true);
    assert.deepEqual(env.calls.map((call) => call.args.text), ['b']);
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('ast/choices: collects three sequential answers and asks the LLM to summarize them', async () => {
  const env = await createEnv('ast_sequential_choices');
  try {
    const llm = env.useLlm(['Summary: a, b, c']);
    const choices = ['a', 'b', 'c'];
    const questions = [
      { prompt: 'Choose the first option:', as: 'firstAnswer' },
      { prompt: 'Choose the second option:', as: 'secondAnswer' },
      { prompt: 'Choose the third option:', as: 'thirdAnswer' },
    ];
    const { requestId, result } = await runAst(env, {
      type: 'Curator_Sequential',
      name: 'Three Sequential Choices',
      subAgents: [
        ...questions.map(({ prompt, as }) => ({
          type: 'Curator_HumanInput',
          prompt,
          inputType: 'choices',
          choices,
          as,
        })),
        {
          type: 'Curator_Agent',
          agentName: 'choice-summarizer',
          model: 'fake-model',
          prompt: 'Summarize these answers: {firstAnswer}, {secondAnswer}, {thirdAnswer}',
        },
      ],
    });

    let stepResult = result;
    assert.equal(stepResult.waiting, true);
    for (const [index, question] of questions.entries()) {
      const waitingRequest = await env.prisma.request.findFirst({
        where: { conversationId: env.conversationId, status: 'WAITING_FOR_USER' },
      });
      assert.ok(waitingRequest, `question ${index + 1} should be waiting for an answer`);
      assert.equal(waitingRequest.context.choicePrompt, question.prompt);
      assert.deepEqual(
        waitingRequest.context.activeChoices,
        choices.map((choice) => ({ id: choice, label: choice, value: choice })),
      );

      await env.processor.emitEventRequest({
        eventName: 'curator:choice',
        payload: choices[index],
        conversationId: env.conversationId,
        userId: env.userId,
        origin: 'API',
      });
      stepResult = await env.processor.stepUntil({ conversationId: env.conversationId });
      assert.equal(stepResult.waiting, index < questions.length - 1);
    }

    assert.equal(stepResult.done, true);
    assert.equal(llm.requests.length, 1);
    assert.deepEqual(
      llm.requests[0].messages.map((message) => message.content),
      ['a', 'b', 'c', 'Summarize these answers: a, b, c'],
    );
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
    const responses = await env.prisma.response.findMany({
      where: { conversationId: env.conversationId },
      orderBy: { id: 'asc' },
    });
    assert.equal(responses.at(-1).content, 'Summary: a, b, c');
  } finally {
    await env.cleanup();
  }
});

test('ast/choices: joins three parallel choice questions before asking the LLM to summarize', async () => {
  const env = await createEnv('ast_parallel_choices');
  try {
    const llm = env.useLlm(['Summary: a, b, c']);
    const choices = ['a', 'b', 'c'];
    const questions = [
      { prompt: 'Choose the first option:', as: 'firstAnswer' },
      { prompt: 'Choose the second option:', as: 'secondAnswer' },
      { prompt: 'Choose the third option:', as: 'thirdAnswer' },
    ];
    const { requestId, result } = await runAst(env, {
      type: 'Curator_Sequential',
      name: 'Parallel Choice Questions',
      subAgents: [
        {
          type: 'Curator_Parallel',
          name: 'Choice Question Fan-out',
          subAgents: questions.map(({ prompt, as }) => ({
            type: 'Curator_HumanInput',
            prompt,
            inputType: 'choices',
            choices,
            as,
          })),
        },
        {
          type: 'Curator_Agent',
          agentName: 'choice-summarizer',
          model: 'fake-model',
          prompt: 'Summarize these answers: {firstAnswer}, {secondAnswer}, {thirdAnswer}',
        },
      ],
    });

    assert.equal(result.waiting, true);
    const waitingRequests = await env.prisma.request.findMany({
      where: { conversationId: env.conversationId, status: 'WAITING_FOR_USER' },
    });
    assert.equal(waitingRequests.length, questions.length);
    for (const question of questions) {
      const waitingRequest = waitingRequests.find(
        (request: any) => request.context.choicePrompt === question.prompt,
      );
      assert.ok(waitingRequest, `${question.prompt} should be waiting for an answer`);
      assert.deepEqual(
        waitingRequest.context.activeChoices,
        choices.map((choice) => ({ id: choice, label: choice, value: choice })),
      );
    }

    let resumed = result;
    for (const [index, question] of questions.entries()) {
      const waitingRequest = waitingRequests.find(
        (request: any) => request.context.choicePrompt === question.prompt,
      );
      const emitted = await env.processor.emitEventRequest({
        eventName: 'curator:choice',
        payload: choices[index],
        conversationId: env.conversationId,
        userId: env.userId,
        origin: 'API',
        targetRequestId: waitingRequest.id,
      });
      assert.deepEqual(emitted.woken, [waitingRequest.id]);

      resumed = await env.processor.stepUntil({ conversationId: env.conversationId });
      assert.equal(resumed.waiting, index < questions.length - 1);
    }

    assert.equal(resumed.done, true);
    assert.equal(llm.requests.length, 1);
    assert.deepEqual(
      llm.requests[0].messages.map((message) => message.content),
      ['a', 'b', 'c', 'Summarize these answers: a, b, c'],
    );
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
    const responses = await env.prisma.response.findMany({
      where: { conversationId: env.conversationId },
      orderBy: { id: 'asc' },
    });
    assert.equal(responses.at(-1).content, 'Summary: a, b, c');
  } finally {
    await env.cleanup();
  }
});

test('ast/choice: conditional choices are offered only while their `when` expression holds', async () => {
  const env = await createEnv('ast_choice_when', { listing: () => ({ count: 0 }) });
  try {
    await runAst(env, {
      type: 'Curator_Sequential',
      subAgents: [
        { type: 'Curator_Tool', toolName: 'listing', args: {}, as: 'listing' },
        {
          type: 'Curator_HumanInput',
          prompt: 'Lobby:',
          inputType: 'choices',
          choices: [
            { id: 'new', label: 'New' },
            { id: 'resume', label: 'Resume', when: '$context.listing.count > 0' },
            { id: 'exit', label: 'Exit', when: '$context.listing.count == 0' },
          ],
          as: 'selection',
        },
      ],
    });

    const waitingRequest = await env.prisma.request.findFirst({
      where: { conversationId: env.conversationId, status: 'WAITING_FOR_USER' },
    });
    assert.deepEqual(waitingRequest.context.activeChoices, [
      { id: 'new', label: 'New' },
      { id: 'exit', label: 'Exit' },
    ]);
  } finally {
    await env.cleanup();
  }
});

test('ast/tool: spread=false binds the output under `as` only, without merging its fields into context', async () => {
  const env = await createEnv('ast_tool_spread', {
    make: () => ({ tableId: 't-1' }),
    echo: (a: any) => ({ echoed: a.text }),
  });
  try {
    const { result } = await runAst(env, {
      type: 'Curator_Sequential',
      subAgents: [
        { type: 'Curator_Tool', toolName: 'make', args: {}, as: 'made', spread: false },
        { type: 'Curator_Tool', toolName: 'echo', args: { text: '$context.made.tableId' } },
        { type: 'Curator_Tool', toolName: 'echo', args: { text: '$context.tableId || "unset"' } },
        { type: 'Curator_Tool', toolName: 'make', args: {} },
        { type: 'Curator_Tool', toolName: 'echo', args: { text: '$context.tableId || "unset"' } },
      ],
    });

    assert.equal(result.done, true);
    assert.deepEqual(env.calls.filter((c) => c.tool === 'echo').map((c) => c.args.text), ['t-1', 'unset', 't-1']);
  } finally {
    await env.cleanup();
  }
});
