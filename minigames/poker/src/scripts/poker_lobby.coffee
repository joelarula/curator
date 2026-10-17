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
      emit_event "poker:lobby_prompt",
        options: [
          { id: "new", label: "New Game", description: "Start fresh table" }
          { id: "resume", label: "Resume Game", description: "Select from active/paused tables" }
          { id: "exit", label: "Exit", description: "Quit session" }
        ]
      wait_event "poker:lobby_choice", "lobbyChoice"

      if_else "$context.lobbyChoice?.id == 'exit' or $context.lobbyChoice == 'exit'",
        seq("poker:exit_lobby", [
          set_state sessionEnded: true
          emit_event "poker:session_exited", reason: "user_exit"
        ]),
        if_else "$context.lobbyChoice?.id == 'resume' or $context.lobbyChoice == 'resume'",
          seq("poker:resume_table_flow", [
            emit_event "poker:request_table_selection"
            wait_event "poker:table_selected", "selectedTable"
            set_state tableId: "$context.selectedTable?.id || $context.selectedTable"
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
        players: "$context.players || []"

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
    ])
]
