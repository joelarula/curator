import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Event Pub/Sub Pattern',
    subAgents: [
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `
          return (async () => {
            // Cleanup old subscriptions
            await ctx.prisma.eventSubscription.deleteMany({
              where: { eventName: 'system_test_event' }
            });
            
            await ctx.prisma.eventSubscription.create({
              data: {
                eventName: 'system_test_event',
                workflowAst: {
                  type: 'Curator_Script',
                  language: 'javascript',
                  code: 'console.log("\\n\\n================================\\n >>> EVENT LISTENER 1 TRIGGERED! Payload:", JSON.stringify(context.input), "\\n================================\\n"); return "OK 1";'
                },
                userId: ctx.userId,
                projectId: ctx.projectId
              }
            });
            
            await ctx.prisma.eventSubscription.create({
              data: {
                eventName: 'system_test_event',
                workflowAst: {
                  type: 'Curator_Script',
                  language: 'javascript',
                  code: 'console.log("\\n\\n================================\\n >>> EVENT LISTENER 2 TRIGGERED! Payload:", JSON.stringify(context.input), "\\n================================\\n"); return "OK 2";'
                },
                userId: ctx.userId,
                projectId: ctx.projectId
              }
            });

            return "Subscriptions seeded.";
          })();
        `
      },
      {
        type: 'Curator_EmitEvent',
        eventName: 'system_test_event',
        payload: { test_data: 123, msg: "Hello from EmitEvent node!" }
      }
    ]
  };
}
