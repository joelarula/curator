seq "for_each",
  set_state items: ["a", "b", "c"]
  for_each "$state.items",
    tool("echo", { text: "$context.item" })
