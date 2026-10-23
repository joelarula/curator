# Dynamic set of choices: what the player may do depends on the table state, which changes between turns.
# `tools` is an expression, evaluated again on every agent turn.
seq "betting round",
  set_state options: ['fold', 'call', 'raise']
  agent
    agentName: 'player'
    model: 'fake-model'
    instruction: 'Pick exactly one action by calling its tool.'
    prompt: 'Someone bet 20. What do you do?'
    tools: '$state.options'
  set_state options: ['check', 'bet']
  agent
    agentName: 'player'
    model: 'fake-model'
    instruction: 'Pick exactly one action by calling its tool.'
    prompt: 'Everyone checked to you. What do you do?'
    tools: '$state.options'
  set_state options: []
  agent
    agentName: 'player'
    model: 'fake-model'
    instruction: 'Answer in words.'
    prompt: 'The hand is over. Anything to say?'
    tools: '$state.options'
