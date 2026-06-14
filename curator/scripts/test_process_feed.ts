export async function run({ prisma, dbName }: { prisma: any, dbName: string }) {
  console.log(`[Script] Executing process_feed tool against RSS feed...`);

  return {
    type: 'Curator_Sequential',
    subAgents: [
      {
        type: 'Curator_Tool',
        toolName: 'process_feed',
        parameters: {
          url: 'http://uudised.err.ee/uudised_rss.php',
          limit: 5,
          format: 'json'
        }
      },
      {
        type: 'Curator_Agent',
        agentName: 'Summarizer',
        model: 'gemini-2.5-flash',
        instruction: 'You are a raw text summarizer. NEVER greet the user. NEVER act conversational. You must STRICTLY execute the user prompt on the provided text and output ONLY the summary.',
        prompt: 'Task: Summarize the following JSON data in 3 English sentences.\n\nJSON DATA:\n{{INPUT}}'
      }
    ]
  };
}
