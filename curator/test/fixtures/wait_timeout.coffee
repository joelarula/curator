seq "Patient listener",
  wait_event "ping", "msg", { timeoutSeconds: 30 }
  if_else "$state.msg",
    tool("got", { text: "$state.msg.text" }),
    tool("gave_up", {})
  tool "after", {}
