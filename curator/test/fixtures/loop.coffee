seq "loops",
  repeat tool("echo", { text: "tick" }), { maxIterations: 3, until: "$context.iteration >= 2" }
  every "every 5 minutes", tool("echo", { text: "poll" }), { maxIterations: 2, immediate: true }
