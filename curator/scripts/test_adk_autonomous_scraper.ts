export async function run({ prisma, dbName }: { prisma: any, dbName: string }) {
  console.log(`[Script] Submitting ADK Graph pipeline using local TS Tool Calling...`);

  // 2. Return an AST where an Agent is given the URL and asked to autonomously use the tool
  return {
    type: 'ADK_Agent',
    agentName: 'AutonomousWeatherResearcher',
    model: 'gemini-2.0-flash', // Using gemini-2.0-flash as required
    tools: ['web_scraper'], // The agent will dynamically fetch this tool from the DB!
    instruction: 'You are a weather researcher. You have access to a web_scraper tool. You MUST use it to fetch the provided URLs to investigate the weather.',
    prompt: `I have a feed address that contains the latest Estonian news.
URL: https://news.err.ee/rss

Please do the following:
1. Use your web_scraper tool to fetch the content of the URL.
2. Read through the returned feed data.
3. Identify any news items related to the weather, climate, or storms.
4. Write a concise, 2-sentence summary of the current weather situation in Estonia based on that feed.`
  };
}
