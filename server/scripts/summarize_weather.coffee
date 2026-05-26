meta:
  agent: "Weather-Analyst-Agent"
  purpose: "Aggregate and summarize ERR weather reports using a linear tool chain in CoffeeScript"

pipeline:
  feed_url: "http://uudised.err.ee/uudised_rss.php"
  limit: 10

run: |
  flow = new Flow()

  # 1. Fetch and parse the ERR news RSS feed
  feedData = flow.tool "process_feed",
    url: pipeline.feed_url
    limit: pipeline.limit

  # 2. Format the retrieved weather resources into a clean list
  formatData = flow.tool "format_list",
    items: feedData.items
    template: "- {{title}}: {{contentSnippet}}"

  # 3. Send the formatted reports to the LLM for a professional weather summary
  flow.tool "ask_llm",
    prompt: """
      You are a high-fidelity weather analyst. 
      Below is a list of recent weather reports from ERR.
      
      REPORTS:
      #{formatData}

      
      TASK:
      Please provide a professional summary of the current weather situation in Estonia.
    """

  flow.toAST()
