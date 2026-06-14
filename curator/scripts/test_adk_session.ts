export async function run({ dbName }: { dbName: string }) {
  console.log(`[Script] Testing PrismaSessionService on database: ${dbName} via AST graph`);

  return {
    type: 'ADK_Sequential',
    name: 'session_memory_test',
    subAgents: [
      {
        type: 'ADK_Agent',
        agentName: 'MemoryAgent_Step1',
        model: 'gemini-2.0-flash',
        instruction: 'You are a helpful assistant with a great memory. Answer concisely.',
        prompt: 'Hi! My name is Alice, and my favorite color is bright orange.'
      },
      {
        type: 'ADK_Agent',
        agentName: 'MemoryAgent_Step2',
        model: 'gemini-2.0-flash',
        instruction: 'You are a helpful assistant with a great memory. Answer concisely.',
        prompt: 'Can you remind me what my name is, and what color I like?'
      }
    ]
  };
}
