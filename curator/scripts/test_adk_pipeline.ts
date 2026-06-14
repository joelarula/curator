import { type PrismaClient } from '@prisma/client';
import type { AdkSequentialNode } from '../src/engine/AdkAst.js';

export async function run({ prisma, dbName }: { prisma: PrismaClient; dbName: string }) {
  console.log(`[Script] Submitting sophisticated ADK graph AST to database: ${dbName}`);

  // This AST represents a Sequential pipeline.
  // First, an agent extracts topics. Then, we fan-out to analyze them in parallel.
  const ast: AdkSequentialNode = {
    type: 'ADK_Sequential',
    name: 'research_pipeline',
    prompt: 'Apple, Google, and Microsoft announced major AI updates this week.',
    subAgents: [
      {
        type: 'ADK_Agent',
        agentName: 'Extractor',
        model: 'gemini-2.5-flash',
        instruction: 'Extract the company names from the text and output a comma separated list.'
      },
      {
        type: 'ADK_Parallel',
        name: 'fan_out_analysis',
        // The output of Extractor is passed into the parallel node, replacing {{INPUT}}
        prompt: 'Analyze recent stock performance for these companies: {{INPUT}}',
        subAgents: [
          {
             type: 'ADK_Agent',
             agentName: 'Analyst1',
             model: 'gemini-2.5-flash',
             instruction: 'Write a 1-sentence bullish argument for the companies.'
          },
          {
             type: 'ADK_Agent',
             agentName: 'Analyst2',
             model: 'gemini-2.5-flash',
             instruction: 'Write a 1-sentence bearish argument for the companies.'
          }
        ]
      }
    ]
  };

  return ast;
}
