seq "Panel",
  prompt "Ask the panel:", "text", undefined, { as: "question" }
  parallel "Panel Fan-out",
    agent { agentName: "historian", model: "fake-model", prompt: "historian" }
    agent { agentName: "economist", model: "fake-model", prompt: "economist" }
    agent { agentName: "geographer", model: "fake-model", prompt: "geographer" }
