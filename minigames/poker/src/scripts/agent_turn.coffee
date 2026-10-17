# ---
# id: agent_turn
# name: agent_turn
# description: Autonomous Player Agent Turn Workflow using seated agent instruction & prompt
# ---
# ==============================================================================
# Autonomous Player Agent Turn Workflow
# Deliberates using the agent system prompt defined in agent_prompt.coffee
# ==============================================================================

seq "poker:agent_turn", [
  tool "poker_ai_decision",
    promptScript: "agent_prompt.coffee"
  tool "poker_apply_action",
    action: "$context.lastAiAction"
]
