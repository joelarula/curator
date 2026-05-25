meta:
  agent: "Markdown-Extractor-Agent"
  purpose: "Extract Markdown from Fallacy HTML"

pipeline:
  target_type: "http://schema.org/LogicalFallacy"

run: |
  # 1. Query all resources of type LogicalFallacy
  fallacies = Curator.query_resources
    relation:
      objectUri: pipeline.target_type

  # 2. Iterate over each fallacy resource and run the native HTML scraper cleaning logic
  fallacies.onItemExtracted (res) =>
    Curator.scrape_resource(
      url: res.uri
      role: "MAIN"
    ).onSuccess().chain "debug",
      type: "success"
      msg: "Successfully extracted clean markdown version for fallacy **#{res.uri}**"

  Curator.run()
