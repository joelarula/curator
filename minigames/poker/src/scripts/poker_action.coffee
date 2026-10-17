# ---
# id: poker_action
# name: poker_action
# description: Poker Action Application & State Update Workflow
# ---
# ==============================================================================
# Poker Action Application Workflow
# Validates action, commits chips to pot, and emits state updates
# ==============================================================================

seq "poker:apply_action_step", [
  tool "poker_apply_action",
    action: "$context.action"
  emit_event "poker:action_applied",
    player: "$context.gameState.players[$context.gameState.activePlayerIdx].name"
    action: "$context.action"
    pot: "$context.gameState.pot"
]
