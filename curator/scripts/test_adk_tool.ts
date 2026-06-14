export async function run({ prisma, dbName }: { prisma: any, dbName: string }) {
  console.log(`[Script] Provisioning 'err_scraper' tool into database: ${dbName}`);

  // 1. Provision the tool in the database
  await prisma.tool.upsert({
    where: { name: 'err_scraper' },
    update: {},
    create: {
      name: 'err_scraper',
      description: 'Scrapes the ERR News RSS feed and returns a combined string of titles.',
      parametersSchema: JSON.stringify({}),
      sourceCode: `async (args) => {
        try {
          const response = await fetch('https://news.err.ee/rss');
          const xml = await response.text();
          // Extract <title> tags from RSS using regex
          const titles = [...xml.matchAll(/<title><!\\[CDATA\\[(.*?)\\]\\]><\\/title>|<title>(.*?)<\\/title>/g)]
            .map(m => m[1] || m[2])
            .filter(t => t && !t.includes('ERR News'));
          
          return "LATEST NEWS HEADLINES:\\n" + titles.slice(0, 10).map(t => "- " + t).join('\\n');
        } catch(e) {
          return 'Failed to fetch RSS: ' + e.message;
        }
      }`
    }
  });

  console.log(`[Script] Submitting ADK Graph pipeline using ADK_Tool...`);

  // 2. Return the AST pipeline
  return {
    type: 'ADK_Sequential',
    name: 'err_news_pipeline',
    subAgents: [
      {
        type: 'ADK_Tool',
        toolName: 'err_scraper'
      },
      {
        type: 'ADK_Agent',
        agentName: 'NewsSummarizer',
        model: 'gemini-1.5-flash',
        instruction: 'You are a news summarizer. I will give you a list of news headlines. Pick the 3 most important topics and write a short, one-sentence summary for each.',
        // The output of the ADK_Tool will replace {{INPUT}} here!
        prompt: '{{INPUT}}'
      }
    ]
  };
}
