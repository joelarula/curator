// One node of the two-node smoke run (scripts/two-node-smoke.ts): a real curator host on SMOKE_DB_URL.
// Prints "@@SMOKE {json}" event lines and takes JSON commands (start, emit, stop) on stdin.
import readline from 'node:readline';
import { curatorEngine, defineTool } from '@curator/agent-server';
import { createCuratorHost } from '../dist/index.js';

const node = process.env.SMOKE_NODE ?? 'node';
const emit = (ev: Record<string, any>) => process.stdout.write(`@@SMOKE ${JSON.stringify({ node, t: Date.now(), ...ev })}\n`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

curatorEngine.registerPlugin({
  name: 'smoke',
  tools: [
    defineTool({
      name: 'slow_step',
      description: 'Sleeps, reporting start and end',
      parameters: { type: 'object', properties: { conv: { type: 'number' }, step: { type: 'string' }, ms: { type: 'number' } }, additionalProperties: true },
      execute: async (args: any) => {
        emit({ ev: 'start', conv: args.conv, step: args.step });
        await sleep(args.ms ?? 100);
        emit({ ev: 'end', conv: args.conv, step: args.step });
        return { ok: true, step: args.step };
      },
    } as any),
  ],
} as any);

const quiet = () => {};
const host = await createCuratorHost({
  name: 'smoke',
  curatorDb: { url: process.env.SMOKE_DB_URL },
  durability: (process.env.SMOKE_DURABILITY as any) ?? 'durable',
  intervalMs: 100,
  logLevel: 'warn',
  logger: { log: quiet, info: quiet, warn: (...a: any[]) => console.error(...a), error: (...a: any[]) => console.error(...a) },
  registerPlugins: () => curatorEngine,
});
host.events.onEvent((e: any) => {
  if (e.type === 'conversation_checkpointed') emit({ ev: 'checkpointed', conv: e.payload.conversationId });
});
await host.start(100);
emit({ ev: 'ready', userId: host.user.id, projectId: host.project.id });

readline.createInterface({ input: process.stdin }).on('line', async line => {
  const cmd = JSON.parse(line);
  try {
    if (cmd.cmd === 'start') {
      // A conversation started on this node (in its memory database with 'checkpoint'); "$CONV" in the AST becomes its id
      const conversation = await host.prisma.conversation.create({ data: { userId: host.user.id, projectId: host.project.id } });
      const ast = JSON.parse(JSON.stringify(cmd.ast).replaceAll('"$CONV"', String(conversation.id)));
      await host.prisma.request.create({
        data: { userId: host.user.id, projectId: host.project.id, conversationId: conversation.id, status: 'NEW', toolName: 'Curator_Workflow', ast, scheduledAt: new Date() },
      });
      host.processor.wake();
      emit({ ev: 'started', id: cmd.id, conv: conversation.id });
    } else if (cmd.cmd === 'emit') {
      const result = await host.emitEvent(cmd.event, cmd.payload, { conversationId: cmd.conv });
      emit({ ev: 'emitted', id: cmd.id, conv: cmd.conv, woken: result.woken });
    } else if (cmd.cmd === 'stop') {
      await host.stop();
      process.exit(0);
    }
  } catch (err: any) {
    emit({ ev: 'error', id: cmd.id, message: err?.message ?? String(err) });
  }
});
