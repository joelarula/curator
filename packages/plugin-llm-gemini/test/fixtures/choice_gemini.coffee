# A real model decides what to do from the situation it is given; the flow only controls which actions are on offer.
# Round 1 (strong hand, small bet) offers fold / call / raise. Round 2 (hopeless hand, huge all-in) offers fold / call.
seq "decisions",
  set_state options: ['fold', 'call', 'raise']
  agent
    agentName: 'player'
    provider: 'gemini'
    model: 'gemini-2.5-flash-lite'
    instruction: 'You are a sensible poker player. Decide for yourself and act by calling exactly one of the offered tools; then explain in one short sentence.'
    prompt: 'Your hand: ace of spades, ace of hearts. Board: ace of clubs, 7 of diamonds, 2 of clubs. Pot is 100, you have 1000 chips, and the opponent bets 10.'
    tools: '$state.options'
  set_state options: ['fold', 'call']
  agent
    agentName: 'player'
    provider: 'gemini'
    model: 'gemini-2.5-flash-lite'
    instruction: 'You are a sensible poker player. Decide for yourself and act by calling exactly one of the offered tools; then explain in one short sentence.'
    prompt: 'New hand. Your hand: 7 of clubs, 2 of diamonds. Board: king of spades, queen of hearts, jack of hearts, 9 of spades, 4 of clubs. Pot is 400, you have 1000 chips, and the opponent goes all-in for 1000.'
    tools: '$state.options'
    include_contents: 'none'
