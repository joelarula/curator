# ==============================================================================
# Human-Driven Agent Turn Workflow
# Prompts human actor, awaits input event, and sets decision action
# ==============================================================================

seq "poker:human_turn", [
  emit_event "poker:awaiting_human_action",
    player: "$context.gameState.players[$context.gameState.activePlayerIdx].id"
    name: "$context.gameState.players[$context.gameState.activePlayerIdx].name"
    chips: "$context.gameState.players[$context.gameState.activePlayerIdx].chips"
    toCall: "$context.gameState.currentBet - $context.gameState.players[$context.gameState.activePlayerIdx].streetBet"
    pot: "$context.gameState.pot"
    street: "$context.gameState.currentStreet"

  wait_event "poker:human_action", "humanAction"
  assign "action", "$context.humanAction"
]
