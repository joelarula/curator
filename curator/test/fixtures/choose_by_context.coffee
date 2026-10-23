# The offered choices depend on the flow's own context: each loop item carries the options valid for that player.
seq "betting orbit",
  set_state players: [
    { name: 'ann', options: ['fold', 'call', 'raise'] }
    { name: 'bob', options: ['check', 'bet'] }
    { name: 'cy', options: ['fold'] }
  ]
  for_each "$state.players",
    agent
      agentName: 'player'
      model: 'fake-model'
      instruction: 'Pick exactly one action by calling its tool.'
      prompt: 'Your turn.'
      tools: '$context.item.options'
