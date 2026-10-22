seq "if_else",
  set_state score: 10
  if_else "$state.score > 5",
    tool("echo", { text: "high" }),
    tool("echo", { text: "low" })
