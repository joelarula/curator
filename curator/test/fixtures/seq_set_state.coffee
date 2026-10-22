seq "seq_set_state",
  set_state counter: 1
  tool "echo", { text: "hello" }, "echoed"
  set_state counter: 2
