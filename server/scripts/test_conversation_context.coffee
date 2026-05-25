meta:
  agent: "Coffee-Context-Example-Agent"
  purpose: "Demonstrate Persistent Conversation Context in CoffeeScript"

pipeline:
  focus_key: "research_focus"
  focus_value: "Artificial Intelligence"

run: |
  # 1. Store a value in the persistent conversation metadata
  context = Curator.chain "set_context",
    key: pipeline.focus_key
    value: pipeline.focus_value

  # 2. Immediately retrieve and log it using dynamic templates
  # Any property in conversation metadata is resolved inside the template via {{conversation.<key>}}
  context.onSuccess () =>
    Curator.chain "debug",
      type: "info"
      message: "The persistent conversation focus is now: **{{conversation.research_focus}}**"

  Curator.run()
