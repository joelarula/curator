# ---
# id: human_turn
# name: human_turn
# description: Human Player Turn Workflow with Awaiting Events & Action Dispatch
# ---
# ==============================================================================
# Human-Driven Agent Turn Workflow
# Prompts human actor, awaits input event, and sets decision action
# ==============================================================================

seq "poker:human_turn", [
  tool "poker_get_choices",
    state: "$context.gameState"
    playerIdx: "$context.gameState.activePlayerIdx"

  emit_event "poker:awaiting_human_action",
    player: "$context.gameState.players[$context.gameState.activePlayerIdx].id"
    name: "$context.gameState.players[$context.gameState.activePlayerIdx].name"
    chips: "$context.gameState.players[$context.gameState.activePlayerIdx].chips"
    toCall: "$context.gameState.currentBet - $context.gameState.players[$context.gameState.activePlayerIdx].streetBet"
    pot: "$context.gameState.pot"
    street: "$context.gameState.currentStreet"
    choices: "$context.poker_get_choices.choices"

  wait_event "poker:human_action", "humanAction"
  tool "poker_apply_action",
    action: "$context.humanAction"
]
