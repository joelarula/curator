isolated "Private Ring",
  seq "a",
    wait_event "start", "heard"
    emit_event "ring", { from: "a", text: "$state.heard" }, "b"
    wait_event "ring", "heard"
    tool "heard", { agent: "a", from: "$state.heard.from", text: "$state.heard.text" }
  seq "b",
    wait_event "ring", "heard"
    tool "heard", { agent: "b", from: "$state.heard.from", text: "$state.heard.text" }
    emit_event "ring", { from: "b", text: "$state.heard.text" }, "c"
  seq "c",
    wait_event "ring", "heard"
    tool "heard", { agent: "c", from: "$state.heard.from", text: "$state.heard.text" }
    emit_event "ring", { from: "c", text: "$state.heard.text" }, "a"
  seq "spy",
    wait_event "ring", "heard"
    tool "heard", { agent: "spy", from: "$state.heard.from", text: "$state.heard.text" }
