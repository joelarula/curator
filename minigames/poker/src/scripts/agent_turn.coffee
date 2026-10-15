# ==============================================================================
# Autonomous Player Agent Turn Workflow
# Deliberates using the agent system prompt defined in agent_prompt.coffee
# ==============================================================================

seq "poker:agent_turn", [
  tool "poker_ai_decision",
    promptScript: "agent_prompt.coffee"
  assign "action", "$context.lastAiAction"
]
