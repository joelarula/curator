seq "Late joiner",
  wait_event "news", "item", { replay: true }
  tool "heard", { text: "$state.item.text" }
  wait_event "news", "item", { replay: true }
  tool "heard", { text: "$state.item.text" }
