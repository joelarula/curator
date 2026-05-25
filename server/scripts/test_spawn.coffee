meta:
  agent: "Coffee-Spawn-Example-Agent"
  purpose: "Demonstrate Spawning in CoffeeScript Pipelines"

pipeline:
  target_url: "https://example.com"

run: |
  # 1. Simple detached background task
  # Spawning a tool creates a separate independent Request record in the database
  Curator.spawn "upsert_resource",
    uri: "https://example.com/background-seed"
    title: "Seeded Background Resource"

  # 2. Sequential crawl with a fanned-out background spawn
  index = Curator.chain "fetch_html", url: pipeline.target_url

  index.onSuccess (html) =>
    links = Curator.extract_resource_links
      resourceUri: html.uri
      html: html.content
      selector: "a"
      baseUrl: pipeline.target_url

    # For each extracted link, we spawn a detached background crawler task
    # This prevents one slow fetch from blocking the rest of the inline loop execution
    links.onItemExtracted (link) =>
      Curator.spawn "scrape_resource",
        url: link.uri
        role: "MAIN"

      # Log the spawn event
      - [log-status]
        type: "success"
        msg: "Spawned background scrape request for **#{link.uri}**"

  Curator.run()
