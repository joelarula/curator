# ==============================================================================
# Master Poker Agent Prompt & Conversation History Formatter
# Injects persona instruction, table rules, and builds conversational history from context
# ==============================================================================

###
Formats asymmetric conversation history from the perspective of the acting player.
Whispers are private: if sent to/by this player, the text is revealed; otherwise it is noted as an observed secret.
###
formatConversationHistory = (remarks = [], playerId) ->
  return "None" if not remarks or remarks.length is 0

  lines = for r in remarks.slice(-6)
    if r.speechAct is 'WHISPER'
      if r.speakerId is playerId
        "[YOU WHISPERED to #{r.recipientId}]: \"#{r.text}\""
      else if r.recipientId is playerId
        "[#{r.speakerName} WHISPERED to you]: \"#{r.text}\""
      else
        "[OBSERVED]: #{r.speakerName} leaned over and whispered secretly to #{r.recipientId}."
    else
      "#{r.speakerName} (#{r.speechAct or 'TABLE_TALK'}): \"#{r.text}\""

  lines.join("\n")

buildAgentPrompt = (args) ->
  # Support passing context directly ($context), or { player, gameState, ... }, or direct player
  ctx = args?.context or args or {}
  player = ctx.player or (if args?.id or args?.name then args else {})
  gameState = ctx.gameState or args?.gameState or {}
  handDesc = ctx.handDesc or args?.handDesc or "Evaluating hand strength"
  cardsStr = ctx.cardsStr or args?.cardsStr or "Hidden"
  boardStr = ctx.boardStr or args?.boardStr or "None"

  # 1. Inject persona instruction from context
  instruction = player.instruction or (if player.persona then "You are #{player.name}, an autonomous poker agent. Character disposition: #{player.persona}." else "You are #{player.name}, an autonomous poker agent.")

  # 2. Extract table dynamics
  toCall = Math.max(0, (gameState.currentBet or 0) - (player.streetBet or 0))
  pot = gameState.pot or 0
  minRaise = gameState.minRaise or 20
  street = gameState.currentStreet or "PREFLOP"

  # 3. Form game conversation history from context
  remarks = ctx.recentRemarks or gameState.recentRemarks or []
  conversationHistory = formatConversationHistory(remarks, player.id)

  # 4. Active opponents at the table
  opponentsList = for p in (gameState.players or []) when p.id isnt player.id
    status = if p.folded then "FOLDED" else if p.allIn then "ALL-IN" else "ACTIVE"
    "#{p.name} ($#{p.chips}, #{status})"
  opponentsStr = if opponentsList.length > 0 then opponentsList.join(", ") else "None"

  rulesBlock = ctx.rulesDescription or """
  Texas Hold'em Table Rules & Protocol:
  - Allowed betting actions: CHECK, CALL, RAISE, ALL_IN, FOLD.
  - If Cost to Call is 0: you CANNOT FOLD. You must CHECK or RAISE (never fold for free).
  - If Cost to Call > 0: you can CALL, RAISE, ALL_IN, or FOLD.
  - When raising: your total wager must be at least Cost to Call + Min Raise, up to your total chip stack.
  - When chips <= Cost to Call: your only aggressive options are CALL (putting you ALL-IN) or ALL_IN.
  - Table Discourse: You autonomously choose when to speak (TABLE_TALK, BANTER, WHISPER, PROVOKE, GOSSIP) or stay silent based on your persona.
  """

  # 5. Formulate unified Agent System Prompt with Texas Hold'em Rules
  systemPrompt = """
  You are #{player.name}, an autonomous agent playing Texas Hold'em Poker in the Curator ecosystem.

  Agent Persona & Character Instruction:
  #{instruction}

  #{rulesBlock}
  - Output Format: You MUST strictly respond in valid JSON format:
  {
    "action": "CHECK" | "CALL" | "RAISE" | "ALL_IN" | "FOLD",
    "amount": number (required if RAISE or CALL; for RAISE, specify total street bet or raise amount),
    "speech": "dialogue spoken out loud to the table (optional, 1 sentence in character)",
    "speechAct": "TABLE_TALK" | "BANTER" | "WHISPER" | "PROVOKE" | "GOSSIP",
    "innerMonologue": "private strategic reasoning about this turn (1 sentence)"
  }
  """

  # 6. Formulate turn state & contextual dialogue prompt
  userPrompt = """
  Current Texas Hold'em Turn State:
  - Hole Cards: #{cardsStr} (#{handDesc})
  - Community Cards: #{boardStr}
  - Street: #{street}
  - Pot: $#{pot}
  - Bet to match: $#{gameState.currentBet or 0}
  - Your Stack: $#{player.chips}
  - Cost to Call: $#{toCall}
  - Min Raise: $#{minRaise}
  - Opponents: #{opponentsStr}
  - Recent Table Dialogue & Conversation History:
  #{conversationHistory}
  """

  # If called with single player object, return systemPrompt string for backward compatibility
  if not (ctx.gameState or args?.gameState)
    return systemPrompt

  { systemPrompt, userPrompt, conversationHistory }

buildAgentPrompt.formatConversationHistory = formatConversationHistory
buildAgentPrompt.buildAgentPrompt = buildAgentPrompt

module.exports = buildAgentPrompt
