parallel "Whisper Ring With Human",
  seq "human",
    prompt "Secret word:", "text", undefined, { as: "secret" }
    emit_event "whisper:a", { from: "human", text: "$state.secret" }
    wait_event "whisper:human", "back"
    tool "heard", { agent: "human", from: "$state.back.from", text: "$state.back.text" }
  seq "agent a",
    wait_event "whisper:a", "heard_a"
    tool "heard", { agent: "a", from: "$state.heard_a.from", text: "$state.heard_a.text" }
    emit_event "whisper:b", { from: "a", text: "$state.heard_a.text" }
  seq "agent b",
    wait_event "whisper:b", "heard_b"
    tool "heard", { agent: "b", from: "$state.heard_b.from", text: "$state.heard_b.text" }
    emit_event "whisper:c", { from: "b", text: "$state.heard_b.text" }
  seq "agent c",
    wait_event "whisper:c", "heard_c"
    tool "heard", { agent: "c", from: "$state.heard_c.from", text: "$state.heard_c.text" }
    emit_event "whisper:human", { from: "c", text: "$state.heard_c.text" }
