# Spontaneous trilogue driven by the real engine and a real LLM. Nobody is told to open: a is the most impatient and
# speaks up when the room stays silent. Everyone else reacts to what they hear; each agent speaks twice.
# history_from: 'conversation' makes every agent build its prompt from the shared conversation as it sees it.
participant = (me, persona, patience) ->
  repeat seq("#{me} turn",
    set_state "heard_#{me}": null
    wait_event "say", "heard_#{me}", { timeoutSeconds: patience }
    agent
      agentName: me
      provider: 'gemini'
      model: 'gemini-2.5-flash-lite'
      instruction: persona
      prompt: 'It is your turn. Reply with only your next line, one or two short sentences.'
      history_from: 'conversation'
    emit_event "say", { from: me }
  ), { name: "participant #{me}", maxIterations: 2 }

room = 'Three friends, a, b and c, chat freely about where to go on a weekend trip. Messages from the others appear as "[name]: text". Reply with ONLY your own next line, with no name prefix.'

parallel "Spontaneous trilogue",
  participant "a", "You are a, the organiser. #{room}", 10
  participant "b", "You are b, who loves the mountains. #{room}", 600
  participant "c", "You are c, who prefers the sea. #{room}", 600
