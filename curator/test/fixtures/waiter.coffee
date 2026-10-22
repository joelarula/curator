seq "Waiter",
  prompt "Your nickname?", "text", undefined, { as: "nick" }
  tool "register", { nick: "$state.nick" }
  seq "Next flow",
    tool "welcome", { nick: "$state.nick" }
