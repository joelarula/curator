# ==============================================================================
# Poker Lobby Workflow
# Initializes table, seats dynamic players, binds wallets, emits lobby events
# ==============================================================================

seq "poker:lobby_manager", [
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
    seq "poker:wait_for_players", [
      emit_event "poker:awaiting_players",
        tableId: "$context.gameState.tableId"
        seatedCount: "$context.gameState.players.length"
      wait_event "poker:player_joined", "joinRequest"
      tool "poker_join_lobby", player: "$context.joinRequest"
    ]
]
