# Turn 1 offers a tool and the model uses it; turn 2 offers no tools but sees turn 1 in its history.
seq "history",
  agent
    agentName: 'first'
    model: 'fake-model'
    instruction: 'Act by calling a tool.'
    prompt: 'Pick an action.'
    tools: ['fold']
  agent
    agentName: 'second'
    model: 'fake-model'
    instruction: 'Explain what happened.'
    prompt: 'What was done?'
