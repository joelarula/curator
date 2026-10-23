# The model is offered a closed set of choices, each one a tool, and must act by calling exactly one of them.
agent
  agentName: 'player'
  model: 'fake-model'
  instruction: 'You are at a poker table. Pick exactly one action by calling its tool.'
  prompt: 'Pot is 100, you hold a pair of kings. What do you do?'
  tools: ['fold', 'call', 'raise']
