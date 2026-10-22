repeat seq("Interview Turn",
  agent { agentName: "interviewer", model: "fake-model", prompt: "Ask the next question." }
  prompt("Your answer:", "text", undefined, { as: "answer" })
), { name: "Interview", maxIterations: 2 }
