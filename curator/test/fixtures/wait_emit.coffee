seq "wait_emit",
  set_state phase: 1
  wait_event "go", "payload"
  tool("echo", { text: "$state.payload.msg" })
