import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';

// Dialogue model: a conversation is a Loop whose body is [HumanInput(text) -> Agent(LLM)].
// Each turn = one user answer (parked WAITING_FOR_USER) + one assistant Response.
const turn = {
  type: 'Curator_Sequential',
  name: 'Dialogue Turn',
  subAgents: [
    { type: 'Curator_HumanInput', prompt: 'Your question:', inputType: 'text', as: 'question', blocking: true },
    { type: 'Curator_Agent', agentName: 'assistant', model: 'fake-model', prompt: 'Answer briefly.', as: 'assistant' },
  ],
};

async function say(env: any, text: string) {
  await env.processor.emitEventRequest({
    eventName: 'curator:choice',
    payload: text,
    conversationId: env.conversationId,
    userId: env.userId,
    origin: 'API',
  });
  return env.processor.stepUntil({ conversationId: env.conversationId });
}

test('dialogue: two Q&A turns, assistant sees prior turns, one Response per answer', async () => {
  const env = await createEnv('dialogue_qa');
  try {
    const llm = env.useLlm(['Paris', 'About 2 million']);
    const { requestId, result } = await runAst(env, await compileFixture('dialogue.coffee'));
    assert.equal(result.waiting, true);

    const first = await say(env, 'Capital of France?');
    assert.equal(first.waiting, true, 'parked again for the second question');
    const last = await say(env, 'And its population?');
    assert.equal(last.done, true);

    assert.equal(llm.requests.length, 2);
    const contents = (i: number) => llm.requests[i].messages.map((m: any) => m.content);
    assert.deepEqual(contents(0), ['Capital of France?', 'Answer briefly.']);
    assert.ok(contents(1).includes('Capital of France?'), 'second turn carries the first question');
    assert.ok(contents(1).includes('And its population?'));

    const responses = await env.prisma.response.findMany({
      where: { conversationId: env.conversationId },
      orderBy: { id: 'asc' },
    });
    const replies = responses.map((r: any) => String(r.content));
    assert.ok(replies.includes('Paris'));
    assert.ok(replies.includes('About 2 million'));
    assert.ok(replies.indexOf('Paris') < replies.indexOf('About 2 million'));

    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

// Reversed dialogue (interview): the agent asks, then the human answers: [Agent -> HumanInput].
const interviewTurn = {
  type: 'Curator_Sequential',
  name: 'Interview Turn',
  subAgents: [
    { type: 'Curator_Agent', agentName: 'interviewer', model: 'fake-model', prompt: 'Ask the next question.', as: 'interviewer' },
    { type: 'Curator_HumanInput', prompt: 'Your answer:', inputType: 'text', as: 'answer', blocking: true },
  ],
};

test('dialogue/interview: agent asks first, parks for the human, then asks a follow-up', async () => {
  const env = await createEnv('dialogue_interview');
  try {
    const llm = env.useLlm(['What is your name?', 'Where do you live?']);
    const { requestId, result } = await runAst(env, await compileFixture('interview.coffee'));

    assert.equal(result.waiting, true);
    assert.equal(llm.requests.length, 1, 'agent spoke before any human input');
    const waiting = await env.prisma.request.findFirst({
      where: { conversationId: env.conversationId, status: 'WAITING_FOR_USER' },
    });
    assert.equal(waiting.context.choicePrompt, 'Your answer:');

    const second = await say(env, 'Ada');
    assert.equal(second.waiting, true);
    assert.equal(llm.requests.length, 2);
    const secondMessages = llm.requests[1].messages.map((m: any) => m.content);
    assert.ok(secondMessages.includes('Ada'), 'follow-up question sees the first human answer');

    const last = await say(env, 'London');
    assert.equal(last.done, true);
    assert.equal(llm.requests.length, 2, 'no extra agent call after the final answer');

    const responses = await env.prisma.response.findMany({
      where: { conversationId: env.conversationId },
      orderBy: { id: 'asc' },
    });
    const transcript = responses.map((r: any) => String(r.content));
    const order = ['What is your name?', 'Ada', 'Where do you live?', 'London'].map((t) => transcript.indexOf(t));
    assert.ok(order.every((i) => i >= 0), `transcript has all four turns: ${transcript.join(' | ')}`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'turns alternate agent/human in order');

    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('dialogue: stays parked (no LLM call) until the user speaks', async () => {
  const env = await createEnv('dialogue_idle');
  try {
    const llm = env.useLlm(['unused']);
    const { result } = await runAst(env, { type: 'Curator_Loop', name: 'Dialogue', maxIterations: 1, agent: turn });
    assert.equal(result.waiting, true);
    assert.equal(llm.requests.length, 0);
    const waiting = await env.prisma.request.findMany({
      where: { conversationId: env.conversationId, status: 'WAITING_FOR_USER' },
    });
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0].context.choicePrompt, 'Your question:');
  } finally {
    await env.cleanup();
  }
});


test('dialogue/panel: human asks once, several agents answer in parallel and each sees the question', async () => {
  const env = await createEnv('dialogue_panel');
  try {
    const experts = ['historian', 'economist', 'geographer'];
    const llm = env.useLlm((req: any) => `${req.messages.at(-1).content} answered`);
    const { requestId, result } = await runAst(env, await compileFixture('panel.coffee'));
    assert.equal(result.waiting, true);
    assert.equal(llm.requests.length, 0, 'no agent runs before the human asks');

    const done = await say(env, 'Why did Rome fall?');
    assert.equal(done.done, true);

    assert.equal(llm.requests.length, experts.length, 'one LLM call per agent');
    for (const request of llm.requests) {
      const contents = request.messages.map((m: any) => m.content);
      assert.ok(contents.includes('Why did Rome fall?'), 'every agent sees the human question');
    }

    const responses = await env.prisma.response.findMany({ where: { conversationId: env.conversationId } });
    const replies = responses.map((r: any) => String(r.content));
    for (const name of experts) {
      assert.ok(replies.includes(`${name} answered`), `${name} replied: ${replies.join(' | ')}`);
    }

    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

// CoffeeScript parse check: each fixture must compile to exactly this hand-written AST.
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const humanText = (prompt: string, as: string) => ({ type: 'Curator_HumanInput', prompt, inputType: 'text', as, blocking: true });
const llmAgent = (agentName: string, prompt: string) => ({ type: 'Curator_Agent', agentName, model: 'fake-model', prompt, as: agentName });

test('dialogue/coffee: fixtures compile to the expected ASTs', async () => {
  assert.deepEqual(json(await compileFixture('dialogue.coffee')), {
    type: 'Curator_Loop',
    name: 'Dialogue',
    maxIterations: 2,
    agent: json(turn),
  });
  assert.deepEqual(json(await compileFixture('interview.coffee')), {
    type: 'Curator_Loop',
    name: 'Interview',
    maxIterations: 2,
    agent: json(interviewTurn),
  });
  assert.deepEqual(json(await compileFixture('panel.coffee')), {
    type: 'Curator_Sequential',
    name: 'Panel',
    subAgents: [
      humanText('Ask the panel:', 'question'),
      {
        type: 'Curator_Parallel',
        name: 'Panel Fan-out',
        subAgents: ['historian', 'economist', 'geographer'].map((n) => llmAgent(n, n)),
      },
    ],
  });
});
