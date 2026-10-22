parallel "Whisper Ring With Listeners",
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
  seq "listener on a to b",
    wait_event "whisper:b", "overheard"
    tool "heard", { agent: "listener1", from: "$state.overheard.from", text: "$state.overheard.text" }
  seq "listener on b to c",
    wait_event "whisper:c", "overheard"
    tool "heard", { agent: "listener2", from: "$state.overheard.from", text: "$state.overheard.text" }
  seq "listener on c to a",
    wait_event "whisper:a", "overheard"
    tool "heard", { agent: "listener3", from: "$state.overheard.from", text: "$state.overheard.text" }
