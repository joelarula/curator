# Misconfigured: the tools expression yields a string, not a list.
seq "bad choices",
  set_state options: 'fold'
  agent
    agentName: 'player'
    model: 'fake-model'
    prompt: 'go'
    tools: '$state.options'
