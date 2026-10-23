# The set of choices is computed from state: raise is only offered when the stack can cover it.
seq "computed choices",
  set_state stack: 15, menu: ['fold', 'call', 'raise']
  agent
    agentName: 'player'
    model: 'fake-model'
    prompt: 'go'
    tools: '$state.menu.filter(a => a !== "raise" || $state.stack >= 20)'
