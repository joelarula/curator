meta:
  agent: "Coffee-Curator-Agent"
  purpose: "Semantic Fallacy Migration Agent"

pipeline:
  start_url: "https://www.logicallyfallacious.com/fallacies"
  base_url: "https://www.logicallyfallacious.com"
  selectors:
    index_links: "h3 a"
    fallacy_schema:
      title: "h1"
      description: "p.description"

run: |
  # Execution uses whitespace block scopes and clean async flow
  index = Curator.chain "fetch_html", url: pipeline.start_url

  index.onSuccess (html) =>
    links = Curator.extract_resource_links
      resourceUri: "{{toolOutputs.fetch_html.uri}}"
      html: "{{toolOutputs.fetch_html.content}}"
      selector: pipeline.selectors.index_links
      baseUrl: pipeline.base_url

    links.onItemExtracted (link) =>
      scrape = Curator.scrape_resource
        url: link.uri
        selectors: pipeline.selectors.fallacy_schema

      scrape.onSuccess (data) =>
        Curator.chain "upsert_relation",
          subjectUri: link.uri
          objectUri: "http://schema.org/LogicalFallacy"
          # Logic-to-Markup Bridge via Interpolation
          justification: "Ingested *#{data.title}* via CoffeeScript Pipeline."

        # First-class hybrid layout UI component block for logging
        - [log-status]
          type: "success"
          msg: "Successfully processed **#{data.title}**"

  Curator.run()
