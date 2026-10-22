seq "while_loop",
  set_state n: 0
  while_loop "$state.n < 3",
    seq "body",
      tool("echo", { text: "tick" })
      assign "n", "$state.n + 1"
