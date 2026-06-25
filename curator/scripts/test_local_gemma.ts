/**
 * Test: Run local Gemma (via llama.cpp Docker) as a Curator Agent
 *
 * Prerequisites:
 *   cd llamacpp && docker compose up -d
 *   (Wait for llama-server to load the model — check: curl http://localhost:8080/health)
 *
 * Run:
 *   npm run cli -- scripts/test_local_gemma.ts --db test_gemma
 */

export async function run({ prisma, dbName }: { prisma: any; dbName: string }) {
  console.log('[Script] Submitting local Gemma summarization pipeline...');

  return {
    type: 'Curator_Sequential',
    subAgents: [
      {
        // Step 1: Fetch RSS feed locally (pure TypeScript, no LLM)
        type: 'Curator_Tool',
        toolName: 'process_feed',
        parameters: {
          url: 'http://uudised.err.ee/uudised_rss.php',
          limit: 5,
          format: 'json'
        }
      },
      {
        // Step 2: Summarize with local Gemma via llama.cpp
        type: 'Curator_Agent',
        agentName: 'LocalSummarizer',
        provider: 'local',
        baseUrl: 'http://localhost:8080', // llama.cpp docker port
        // model field is optional — llama.cpp uses whichever model is loaded
        instruction: 'You are a concise news summarizer. Output only the summary, no greetings.',
        prompt: 'Summarize the following news items in 3 English sentences:\n\n{{INPUT}}'
      }
    ]
  };
}
