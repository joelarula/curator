# ---
# id: poker_lobby
# name: poker_lobby
# description: Poker Lobby Workflow for Table Initialization & Dynamic Seating
# ---
# ==============================================================================
# Poker Lobby Workflow
# Initializes table, seats dynamic players, binds wallets, emits lobby events
# ==============================================================================

seq "poker:lobby_manager", [
  # 1. Interactive Lobby Selection Gate (New Game, Resume Game, Exit)
  if_else "not $context.tableId and not $context.bypassLobby",
    seq("poker:lobby_gate", [
      choice "Lobby Options:", [
        { id: "new", label: "New Game - Start fresh table", aliases: ["n"], value: { id: "new" } }
        { id: "resume", label: "Resume Game - Select from active/paused tables", aliases: ["r", "continue"], value: { id: "resume" } }
        { id: "exit", label: "Exit - Quit session", aliases: ["q", "exit", "quit"], value: { id: "exit" } }
      ], as: "lobbyChoice"

      if_else "$context.lobbyChoice?.id == 'exit' or $context.lobbyChoice == 'exit'",
        seq("poker:exit_lobby", [
          set_state sessionEnded: true
          emit_event "poker:session_exited", reason: "user_exit"
        ]),
        if_else "$context.lobbyChoice?.id == 'resume' or $context.lobbyChoice == 'resume'",
          seq("poker:resume_table_flow", [
            tool "poker_list_tables"
            choice "Select Table:", "$context.poker_list_tables.choices", as: "selectedTable"
            set_state tableId: "$context.selectedTable?.id || $context.selectedTable?.tableId || $context.selectedTable"
          ]),
          seq("poker:new_table_flow", [
            set_state tableId: "$context.tableId || 'poker:high_roller_lounge'"
          ])
    ])

  # 2. If session not exited, initialize table
  if_else "not $context.sessionEnded",
    seq("poker:boot_table", [
      tool "poker_init_lobby",
        tableId: "$context.tableId || 'poker:high_roller_lounge'"
        startingChips: "$context.startingChips || 1000"
        sbAmount: "$context.sbAmount || 10"
        bbAmount: "$context.bbAmount || 20"
        maxSeats: "$context.maxSeats || 6"
        players: "$context.players"

      emit_event "poker:lobby_ready",
        tableId: "$context.gameState.tableId"

      # Dynamic seating loop: if table has fewer than 2 players, wait for join requests
      while_loop "not $context.gameState or $context.gameState.players.length < 2",
        seq("poker:wait_for_players", [
          emit_event "poker:awaiting_players",
            tableId: "$context.gameState.tableId"
            seatedCount: "$context.gameState.players.length"
          wait_event "poker:player_joined", "joinRequest"
          tool "poker_join_lobby", player: "$context.joinRequest"
        ])

      # 3. Main Game Session Loop
      while_loop "not $context.sessionEnded and not $context.gameState?.gameOver",
        seq "poker:single_hand", [
          # Phase 1: Start Hand (rotates button, posts blinds, deals hole cards)
          tool "poker_start_hand", state: "$context.gameState"
          emit_event "poker:new_round", handNumber: "$context.gameState.handNumber"
          emit_event "poker:phase_deal", street: "$context.gameState.currentStreet"

          # Phase 2: Street Wagering Loop (PREFLOP -> FLOP -> TURN -> RIVER)
          while_loop "$context.gameState and not $context.gameState.handOver and $context.gameState.currentStreet != 'SHOWDOWN'",
            seq "poker:street_loop", [
              while_loop "$context.gameState and not $context.gameState.streetComplete and not $context.gameState.handOver",
                seq "poker:turn_step", [
                  if_else "$context.gameState.players[$context.gameState.activePlayerIdx].isHuman",
                    seq("poker:human_agent_flow", [
                      tool "poker_get_choices", state: "$context.gameState", playerIdx: "$context.gameState.activePlayerIdx"
                      emit_event "poker:awaiting_human_action",
                        player: "$context.gameState.players[$context.gameState.activePlayerIdx].id"
                        name: "$context.gameState.players[$context.gameState.activePlayerIdx].name"
                        chips: "$context.gameState.players[$context.gameState.activePlayerIdx].chips"
                        toCall: "$context.gameState.currentBet - $context.gameState.players[$context.gameState.activePlayerIdx].streetBet"
                        pot: "$context.gameState.pot"
                        street: "$context.gameState.currentStreet"
                        choices: "$context.poker_get_choices.choices"
                      wait_event "poker:human_action", "humanAction"
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
                          seq("poker:apply_human_action", [
                            tool "poker_apply_action", state: "$context.gameState", action: "$context.humanAction"
                          ])
                    ]),
                    seq("poker:ai_agent_flow", [
                      tool "poker_ai_decision", state: "$context.gameState"
                      tool "poker_apply_action", state: "$context.gameState", action: "$context.poker_ai_decision.action || $context.action"
                    ])
                  if_else "not $context.sessionEnded and not $context.isPaused",
                    emit_event "poker:action_taken",
                      player: "$context.gameState.players[$context.gameState.activePlayerIdx].name"
                ]
              if_else "$context.gameState and not $context.gameState.handOver",
                seq("poker:deal_next_street", [
                  tool "poker_deal_street", state: "$context.gameState"
                  emit_event "poker:phase_street", street: "$context.gameState.currentStreet"
                ])
            ]

          # Phase 3: Settle & Adjudicate Showdown (distributes main/side pots)
          tool "poker_distribute_pots", state: "$context.gameState"
          emit_event "poker:phase_settle", winnerSummary: "$context.winnerSummary"

          # Phase 4: Bankruptcy Check & Leaderboard Standings
          tool "poker_check_game_over", state: "$context.gameState"
          tool "poker_rotate_dealer", state: "$context.gameState"
        ]

      # Phase 5: Final Game Over Session Summary
      emit_event "poker:game_over", standings: "$context.standings"
    ])
]
