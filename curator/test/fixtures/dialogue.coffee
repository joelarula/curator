repeat seq("Dialogue Turn",
  prompt("Your question:", "text", undefined, { as: "question" })
  agent { agentName: "assistant", model: "fake-model", prompt: "Answer briefly." }
), { name: "Dialogue", maxIterations: 2 }
