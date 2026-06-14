# rss_weather_agent.coffee
#
# 1. Fetch ERR RSS                  — Node.js code (reliable)
# 2. Filter items where category=ilm — Node.js code (deterministic)
# 3. Pass texts to ADK runner        — session-persisted LLM turn
#
# Why no ADK tool for fetching?
#   gemini-2.5-flash sometimes skips tool calls or returns empty parts[]
#   when thinking is enabled. Doing the fetch/filter in code avoids those
#   failure modes entirely. The ADK runner is still used for the LLM turn
#   so session state is persisted to SQLite.
#
# Usage:
#   npx tsx src/bin/cli.ts run scripts/rss_weather_agent.coffee --db err_weather

import { Agent } from '@google/adk'

FEED_URL = 'https://www.err.ee/rss'

# ── XML helpers ───────────────────────────────────────────────────────────────

stripHtml = (s) ->
  s.replace(/<[^>]*>/g, '')
   .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/\s+/g, ' ').trim()

extractTag = (xml, tag) ->
  cdata = new RegExp "<#{tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></#{tag}>", 'i'
  plain = new RegExp "<#{tag}>([\\s\\S]*?)</#{tag}>", 'i'
  (cdata.exec xml)?[1]?.trim() or (plain.exec xml)?[1]?.trim() or ''

parseItems = (xml) ->
  items = []
  re = /<item>([\s\S]*?)<\/item>/gi
  while (m = re.exec xml)?
    block = m[1]
    items.push
      title:    stripHtml extractTag block, 'title'
      desc:     stripHtml extractTag block, 'description'
      category: (extractTag block, 'category').trim().toLowerCase()
  items

# ── Entry point ───────────────────────────────────────────────────────────────

export run = ({ prisma, dbName }) ->
  console.log "[Script] Fetching #{FEED_URL}..."

  res = await fetch FEED_URL, headers: { 'User-Agent': 'CuratorAgent/1.0' }
  unless res.ok
    throw new Error "Feed fetch failed: HTTP #{res.status}"

  xml     = await res.text()
  all     = parseItems xml
  weather = all.filter (i) -> i.category is 'ilm'

  console.log "[Script] #{weather.length} weather items out of #{all.length} total"

  if weather.length is 0
    console.log "[Script] No 'ilm' items in feed right now — nothing to summarise."
    return

  # Build the text block that goes into the prompt
  block = weather.map((item, i) ->
    "#{i + 1}. #{item.title}\n   #{item.desc}"
  ).join '\n\n'

  prompt = """
    Summarise these #{weather.length} weather news items from ERR (Estonian Public Broadcasting).
    Titles and descriptions are in Estonian.

    For each item write one English bullet:
      • [Estonian title] — one-sentence English summary.

    Then write a short 2–3 sentence English paragraph describing the overall weather picture.

    Items:
    #{block}
  """

  # Instead of manually executing, we return the AST so the CLI can orchestrate it via database
  console.log "[Script] Returning ADK_Agent AST to CLI for database execution..."
  return {
    type: 'ADK_Agent'
    agentName: 'weather_summarizer'
    prompt: prompt
    model: 'gemini-2.5-flash'
  }
