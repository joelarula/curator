meta:
  agent: "ERR-Weather-Extractor-Agent"
  purpose: "Fetch ERR news feed, extract weather-related items via LLM, then summarize the weather"

pipeline:
  feed_url: "http://uudised.err.ee/uudised_rss.php"
  feed_limit: 50

run: |
  flow = new Flow()

  # 1. Fetch and parse the ERR news RSS feed
  feedData = flow.tool "process_feed",
    url: pipeline.feed_url
    limit: pipeline.feed_limit

  # 2. Format all feed items (title + description) into a single readable digest
  digest = flow.tool "format_list",
    items: "{{toolOutputs.process_feed.items}}"
    template: "- {{title}}: {{contentSnippet}}"
    separator: "\n"

  # 3. Ask the LLM to extract only the weather-related entries from the digest
  weatherTexts = flow.tool "ask_llm",
    prompt: """
      Below is a list of news article titles and snippets from ERR (Estonian public broadcaster).
      
      NEWS DIGEST:
      #{digest}
      
      TASK:
      Read through all of the above entries carefully.
      Extract and list ONLY the entries that are related to weather, meteorology, or climate conditions.
      For each weather-related entry, include its title and full snippet.
      If there are no weather-related entries, respond with exactly: NO_WEATHER_ITEMS
    """

  # 4. Ask the LLM to synthesize a professional weather summary from the extracted texts
  flow.tool "ask_llm",
    prompt: """
      You are a high-fidelity weather analyst.
      Below are weather-related news excerpts extracted from the ERR news feed.
      
      WEATHER EXCERPTS:
      #{weatherTexts.result}
      
      TASK:
      Based on these excerpts, provide a professional and concise summary of the current
      weather situation in Estonia. Structure your answer with:
      - Current conditions
      - Precipitation patterns
      - Temperature trends (if mentioned)
      - Outlook
    """

  flow.toAST()
