seq "Waiter with retry",
  repeat seq("ask",
    prompt "Your nickname?", "text", undefined, { as: "nick", timeoutSeconds: 30 }
    if_else "!$state.nick", tool("remind", { nick: "" })
  ), { until: "$state.nick", maxIterations: 3, name: "ask until named" }
  if_else "$state.nick",
    seq("Next flow",
      tool "register", { nick: "$state.nick" }
      tool "welcome", { nick: "$state.nick" }
    ),
    tool "give_up", {}
