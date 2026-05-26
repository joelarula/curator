meta:
  agent: "Weather-Analyst-Agent"
  purpose: "Aggregate and summarize ERR weather reports using a linear tool chain in CoffeeScript"

pipeline:
  object_uri: "err:ilm"
  limit: 10

run: |
  flow = new Flow()

  # 1. Query the recent weather resources
  queryData = flow.tool "query_resources",
    relation:
      objectUri: pipeline.object_uri
    limit: pipeline.limit

  # 2. Format the retrieved weather resources into a clean list
  formatData = flow.tool "format_list",
    items: queryData.items
    template: "- {{title}}: {{description}}"

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
