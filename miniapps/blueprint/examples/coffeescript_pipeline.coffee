# CoffeeScript Natural Verbs Pipeline
#
# Declares a Curator execution workflow using simple, punctuation-free verbs:
#   seq, set_state, tool, assign, prompt, if_else, while_loop

seq "coffee_demo_pipeline",
  set_state initialized: true, batchId: "BATCH-42"
  tool "calculate_metric",
    baseValue: 75
    multiplier: 4
  assign "state.computedSummary", (ctx) ->
    res = ctx.input
    val = res?.calculated ? 0
    "CoffeeScript Formatter: The computed metric is #{val}."
