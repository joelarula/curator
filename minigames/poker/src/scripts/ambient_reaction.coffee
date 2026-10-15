# ==============================================================================
# Ambient Reaction & Table Talk Event Workflow
# Triggers dynamic whispers, banter, or gossip in response to game events
# ==============================================================================

seq "poker:ambient_reaction", [
  tool "poker_human_speech",
    speechAct: "$context.eventSpeechAct || 'TABLE_TALK'"
    targetId: "$context.eventTargetId"
    text: "$context.eventText || ''"
  emit_event "poker:ambient_spoken",
    speaker: "$context.speakerName"
    speechAct: "$context.speechAct"
    text: "$context.text"
]
