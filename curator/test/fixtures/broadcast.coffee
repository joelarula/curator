isolated "Announcement",
  seq "a",
    wait_event "announce", "msg"
    tool "heard", { agent: "a", text: "$state.msg.text" }
    wait_event "announce", "msg"
    tool "heard", { agent: "a", text: "$state.msg.text" }
  seq "b",
    wait_event "announce", "msg"
    tool "heard", { agent: "b", text: "$state.msg.text" }
    wait_event "announce", "msg"
    tool "heard", { agent: "b", text: "$state.msg.text" }
  seq "c",
    wait_event "announce", "msg"
    tool "heard", { agent: "c", text: "$state.msg.text" }
    wait_event "announce", "msg"
    tool "heard", { agent: "c", text: "$state.msg.text" }
