/**
 * rss_weather_agent.ts
 *
 * ERR weather agent using ADK FunctionTool for the live feed fetch.
 *
 * Key design decisions vs earlier CoffeeScript attempts:
 *   - Uses gemini-2.0-flash (no thinking tokens → no empty-parts events)
 *   - fetch_err_weather tool has NO parameters: URL is hardcoded inside,
 *     the model cannot substitute a different feed URL
 *   - Tool pre-filters weather items, returning a small payload (not all 50)
 *   - executeAgent() captures the final text response correctly
 *
 * Usage:
 *   npx tsx src/bin/cli.ts run scripts/rss_weather_agent.ts --db err_weather --reset
 */

import { Agent, FunctionTool } from '@google/adk';
import { type PrismaClient } from '@prisma/client';
import { executeAgent } from '../src/index.js';

// ─── Config ───────────────────────────────────────────────────────────────────

// Canonical ERR RSS feed URL (http://uudised.err.ee/uudised_rss.php redirects here)
const FEED_URL = 'https://www.err.ee/rss';

// Specific compound Estonian weather terms — avoids false positives like
// "ilmselt" (obviously) or "jäähoki" (ice hockey).
const WEATHER_KEYWORDS = [
  'ilmateade', 'ilmaennustus', 'ilmaprognoos', 'ilmavaatlus',
  'torm', 'tormihoiatus', 'äike', 'äikesevihm',
  'vihm', 'hoovihm', 'sadu', 'sademed', 'vihmane',
  'lumi', 'lumesadu', 'lumetorm', 'lörts',
  'temperatuur', 'soojus', 'pakane', 'külmarekord',
  'tuulekiirus', 'tuulehoov',
  'udu', 'udune',
  'jäide', 'libedus',
  'põud', 'kuumalaine', 'soojalaine',
  'meteoroloog', 'ilmateenistus',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function extractTag(xml: string, tag: string): string {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return (cdata.exec(xml)?.[1] ?? plain.exec(xml)?.[1] ?? '').trim();
}

function parseRssItems(xml: string) {
  const items: Array<{ title: string; desc: string; category: string }> = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    items.push({
      title:    stripHtml(extractTag(block, 'title')),
      desc:     stripHtml(extractTag(block, 'description')).substring(0, 150),
      category: extractTag(block, 'category').toLowerCase(),
    });
  }
  return items;
}

function isWeatherItem(item: { title: string; desc: string; category: string }): boolean {
  if (item.category === 'ilm') return true;
  const text = `${item.title} ${item.desc}`.toLowerCase();
  return WEATHER_KEYWORDS.some(kw => new RegExp(`\\b${kw}`, 'i').test(text));
}

// ─── ADK Tool ─────────────────────────────────────────────────────────────────
// No parameters — URL is hardcoded so the model cannot substitute it.

const fetchErrWeather = new FunctionTool({
  name: 'fetch_err_weather',
  description:
    'Fetches the ERR (Estonian Public Broadcasting) RSS news feed and returns ' +
    'only the weather-related items. Weather items have category="ilm" in the feed. ' +
    'No arguments needed — the feed URL is fixed.',
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: "Today's date (YYYY-MM-DD). Used to label the summary.",
      },
    },
    required: ['date'],
  } as any,
  execute: async (input: any) => {
    const date = (input as { date: string }).date;
    console.log(`[Tool] Fetching ${FEED_URL} for ${date}`);

    const res = await fetch(FEED_URL, { headers: { 'User-Agent': 'CuratorAgent/1.0' } });
    if (!res.ok) return { error: `HTTP ${res.status}`, items: [], totalItems: 0, weatherItems: 0 };

    const xml  = await res.text();
    const all  = parseRssItems(xml);
    // Primary filter: category tag equals 'ilm' (confirmed in live feed)
    // Fallback: keyword scan for weather content without the category tag
    const hits = all.filter(isWeatherItem);
    console.log(`[Tool] ${hits.length} weather items out of ${all.length} total`);
    console.log('[Tool] Weather items:', hits.map(h => h.title));

    return {
      totalItems:   all.length,
      weatherItems: hits.length,
      items:        hits,
    };
  },
});

// ─── Script entry point ───────────────────────────────────────────────────────

export async function run({ prisma, dbName }: { prisma: PrismaClient; dbName: string }) {
  console.log(`[Script] ERR Weather Agent — database: ${dbName}`);

  const agent = new Agent({
    name:  'err_weather_agent',
    model: 'gemini-2.0-flash',
    // Force the model to call a function on turn 1.
    // Without this, Gemini answers from training data and skips the tool.
    config: {
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY' as any,
          allowedFunctionNames: ['fetch_err_weather'],
        },
      },
    },
    instruction: `
      You are a weather news curator for ERR (Estonian Public Broadcasting).
      You have one tool: fetch_err_weather. You MUST call it before answering.

      After calling it:
      • For each returned item write: • [Estonian title] — one-sentence English summary.
      • Add a 2–3 sentence English narrative about the overall weather picture.
      • End with: "X of Y feed items were weather-related."
    `,
    tools: [fetchErrWeather],
  });

  const summary = await executeAgent({
    prisma,
    agent,
    prompt:    'Use fetch_err_weather to get today\'s ERR weather items, then summarise them in English.',
    userId:    'default_user',
    sessionId: `err_weather_${Date.now()}`,
  });


  console.log(`
╔══════════════════════════════════════════════════════════╗
║  ERR WEATHER SUMMARY  (${new Date().toLocaleDateString('et-EE')})
╚══════════════════════════════════════════════════════════╝

${summary}

══════════════════════════════════════════════════════════
`);
}
