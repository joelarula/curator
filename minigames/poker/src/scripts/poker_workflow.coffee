# ==============================================================================
# Curator Texas Hold'em Autonomous Event-Driven Workflow
#
# Declarative state machine orchestration compiling to Curator Execution AST:
# - Dynamic table: Open table accepts arbitrary participants with individual wallets & instructions
# - Universal 5-phase card game order: LOBBY -> DEAL -> STREETS -> SETTLE -> GAMEOVER
# - Event-driven game loop: poker:lobby_ready, poker:new_round, poker:phase_deal,
#   poker:action_taken, poker:phase_street, poker:phase_settle, poker:game_over
# - Dynamic agent decisions & human input gates via Curator wait_event / emit_event
# ==============================================================================

seq "poker:dynamic_engine", [
  # 1. Initialize open table lobby (binds dynamic context players or opens clean table)
  tool "poker_init_lobby",
    tableId: "$context.tableId || 'poker:high_roller_lounge'"
    startingChips: "$context.startingChips || 1000"
    sbAmount: "$context.sbAmount || 10"
    bbAmount: "$context.bbAmount || 20"
    maxSeats: "$context.maxSeats || 6"
    players: "$context.players || []"

  emit_event "poker:lobby_ready",
    tableId: "$context.gameState.tableId"

  # Dynamic lobby seating: if table does not have enough players yet, wait for join requests
  while_loop "not $context.gameState or $context.gameState.players.length < 2",
    seq "poker:wait_for_players", [
      emit_event "poker:awaiting_players", tableId: "$context.gameState.tableId", seatedCount: "$context.gameState.players.length"
      wait_event "poker:player_joined", "joinRequest"
      tool "poker_join_lobby", player: "$context.joinRequest"
    ]

  # 2. Main Game Session Loop
  while_loop "not $context.sessionEnded and not $context.gameState.gameOver",
    seq "poker:single_hand", [
      # Phase 1: Start Hand (rotates button, posts blinds, deals hole cards)
      tool "poker_start_hand"
      emit_event "poker:new_round", handNumber: "$context.gameState.handNumber"
      emit_event "poker:phase_deal", street: "$context.gameState.currentStreet"

      # Phase 2: Street Wagering Loop (PREFLOP -> FLOP -> TURN -> RIVER)
      while_loop "not $context.gameState.handOver and $context.gameState.currentStreet != 'SHOWDOWN'",
        seq "poker:street_loop", [
          while_loop "not $context.gameState.streetComplete and not $context.gameState.handOver",
            seq "poker:turn_step", [
              if_else "$context.gameState.players[$context.gameState.activePlayerIdx].isHuman",
                seq("poker:human_input", [
                  emit_event "poker:awaiting_human_action", player: "$context.gameState.players[$context.gameState.activePlayerIdx].id"
                  wait_event "poker:human_action", "humanAction"
                  assign "action", "$context.humanAction"
                ]),
                seq("poker:agent_decision", [
                  tool "poker_ai_decision"
                  assign "action", "$context.lastAiAction"
                ])
              tool "poker_apply_action", action: "$context.action"
              emit_event "poker:action_taken",
                player: "$context.gameState.players[$context.gameState.activePlayerIdx].name"
                action: "$context.action"
            ]
          if_else "not $context.gameState.handOver",
            seq("poker:deal_next_street", [
              tool "poker_deal_street"
              emit_event "poker:phase_street", street: "$context.gameState.currentStreet"
            ])
        ]

      # Phase 3: Settle & Adjudicate Showdown (distributes main/side pots)
      tool "poker_distribute_pots"
      emit_event "poker:phase_settle", winnerSummary: "$context.winnerSummary"

      # Phase 4: Bankruptcy Check & Leaderboard Standings
      tool "poker_check_game_over"
      tool "poker_rotate_dealer"
    ]

  # Phase 5: Final Game Over Session Summary
  emit_event "poker:game_over", standings: "$context.standings"
]
