# ---
# id: human_turn
# name: human_turn
# description: Human Player Turn Workflow with Awaiting Events & Action Dispatch
# ---
# ==============================================================================
# Human-Driven Agent Turn Workflow
# Prompts human actor, awaits input event, and sets decision action
# ==============================================================================

seq "poker:human_turn", [
  tool "poker_get_choices",
    state: "$context.gameState"
    playerIdx: "$context.gameState.activePlayerIdx"

  choice "Your turn:", "$context.poker_get_choices.choices", as: "humanAction"
  if_else "$context.humanAction?.type == 'PAUSE'",
    seq("poker:handle_pause", [
      set_state isPaused: true
      emit_event "poker:table_paused", tableId: "$context.gameState.tableId"
      while_loop "$context.isPaused and not $context.sessionEnded",
        seq("poker:wait_resume", [
          wait_event "poker:resume_action", "resumeCmd"
          if_else "$context.resumeCmd?.type == 'RESUME' or $context.resumeCmd == 'RESUME'",
            seq("poker:unpause", [
              set_state isPaused: false
              emit_event "poker:table_resumed", tableId: "$context.gameState.tableId"
            ]),
            if_else "$context.resumeCmd?.type == 'EXIT' or $context.resumeCmd == 'EXIT'",
              seq("poker:pause_exit", [
                set_state sessionEnded: true
                set_state isPaused: false
                emit_event "poker:session_exited", reason: "user_exit"
              ])
        ])
    ]),
    if_else "$context.humanAction?.type == 'EXIT'",
      seq("poker:handle_exit", [
        set_state sessionEnded: true
        emit_event "poker:session_exited", reason: "user_exit"
      ]),
      seq("poker:apply_action", [
        tool "poker_apply_action",
          action: "$context.humanAction"
      ])
]
