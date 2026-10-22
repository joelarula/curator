parallel "Whisper Ring",
  seq "agent a",
    wait_event "whisper:start", "secret"
    emit_event "whisper:b", { from: "a", text: "$state.secret" }
    wait_event "whisper:a", "heard"
    tool "heard", { agent: "a", from: "$state.heard.from", text: "$state.heard.text" }
  seq "agent b",
    wait_event "whisper:b", "heard"
    tool "heard", { agent: "b", from: "$state.heard.from", text: "$state.heard.text" }
    emit_event "whisper:c", { from: "b", text: "$state.heard.text" }
  seq "agent c",
    wait_event "whisper:c", "heard"
    tool "heard", { agent: "c", from: "$state.heard.from", text: "$state.heard.text" }
    emit_event "whisper:a", { from: "c", text: "$state.heard.text" }
