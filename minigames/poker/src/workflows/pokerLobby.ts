/**
 * ---
 * id: poker_lobby
 * name: poker_lobby
 * description: Texas Hold'em Lounge Concierge & Table Selection Module
 * ---
 */
import {
  lobbyCtx as lobbyCtxProxy,
  bankrollCtx,
  bootCtx,
  state,
  output,
  setState,
  ifElse,
  whileLoop,
  stateMachine,
  offRecord,
} from '../models/pokerContext.ts';
import {
  defineModule,
  defineSubroutine,
  seq,
  input,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables, pokerPredicates } from '../composables/pokerComposables.ts';
import { PokerLobbyPhase, LOBBY_PHASE_KEY } from '../models/pokerContracts.ts';
import { LobbyReady, AwaitingPlayers, PlayerJoined, TableReady, TableSelected } from '../models/pokerEvents.ts';
import { PokerLobbyAction, LobbyChoices, ReloadChoices } from '../models/pokerLobbyMenu.ts';

const {
  gameState,
  steps,
  boot_table,
  join_table,
  list_tables,
  create_table,
  modules,
  get_buy_in_options,
  deposit_buy_in,
  reload_bankroll,
  handle_user_exit,
} = pokerComposables;

// Lobby menu models are pure presentation; re-exported for existing workflow consumers
export {
  PokerLobbyAction,
  type PokerLobbyActionType,
  type PokerLobbyChoice,
  type PokerTableChoice,
  getLobbyChoices,
  DEFAULT_LOBBY_CHOICES,
} from '../models/pokerLobbyMenu.ts';

export const lobbyActions = PokerLobbyAction;

/**
 * Subroutine for bootstrapping an open table with dynamic seating.
 * Runs as an isolated child call (it waits for players), so it reads the table config from state.
 */
export const bootTableSub = defineSubroutine('boot_table', () => [
  ...boot_table(),
  LobbyReady.emit({ tableId: gameState.tableId }),
  whileLoop(
    pokerPredicates.table_needs_players,
    seq(steps.WAIT_FOR_PLAYERS, [
      AwaitingPlayers.emit({ tableId: gameState.tableId, seatedCount: gameState.players.length }),
      PlayerJoined.wait(bootCtx.joinRequest),
      ...join_table(bootCtx.joinRequest),
    ]),
  ),
  // Seats only (no chips or cards): projected into the table's poker:hasPlayer triples
  setState({
    seatedPlayers: gameState.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHuman: p.isHuman.toBoolean(),
    })),
  }),
  TableReady.emit({ tableId: gameState.tableId, playerCount: gameState.players.length }),
]);

/**
 * Composable conditional step that boots the table if state has not been initialized.
 * Uses pre-scoped `ifElse` and `setState` from `pokerContext.ts` (Pillar 5).
 */
export function buildTableBootStep() {
  return ifElse(
    state.gameState.not().and(bootCtx.sessionEnded.not()),
    seq(steps.BOOT_TABLE, [
      // The boot subroutine is an isolated child call: hand it the run's table config through state
      setState({
        tableConfig: {
          tableId: bootCtx.tableId,
          startingChips: bootCtx.startingChips,
          sbAmount: bootCtx.sbAmount,
          bbAmount: bootCtx.bbAmount,
          maxSeats: bootCtx.maxSeats,
          players: bootCtx.players,
          playerName: bootCtx.playerName,
        },
      }),
      bootTableSub(),
    ]),
  );
}

const loadBuyInOptions = () =>
  get_buy_in_options({ bbAmount: bankrollCtx.bbAmount.orDefault(20) }, { as: bankrollCtx.buyInOptions });

/**
 * The lounge as a Bevy-style state machine: menu → pick or create a table → buy in → boot the table.
 * The active state is mirrored into `$state.lobbyPhase`.
 */
export function buildLobbyPhases() {
  return stateMachine([
    // A table chosen up front (or an ended session) skips the menu
    { to: PokerLobbyPhase.BOOT, when: lobbyCtxProxy.tableId.or(lobbyCtxProxy.sessionEnded) },
    { to: PokerLobbyPhase.MENU },
  ], {
    [PokerLobbyPhase.MENU]: {
      run: [
        list_tables({}, { as: lobbyCtxProxy.openTables }),
        offRecord(input('Lobby Options:', [
          LobbyChoices.NEW,
          { ...LobbyChoices.RESUME, when: lobbyCtxProxy.openTables.tables.length.gt(0) },
          LobbyChoices.EXIT,
        ], { as: lobbyCtxProxy.lobbyChoice })),
      ],
      next: [
        { to: PokerLobbyPhase.NEW_TABLE, when: state.lobbyChoice.isChoice(lobbyActions.NEW) },
        { to: PokerLobbyPhase.PICK_TABLE, when: state.lobbyChoice.isChoice(lobbyActions.RESUME) },
        { to: PokerLobbyPhase.EXIT, when: state.lobbyChoice.isChoice(lobbyActions.EXIT) },
        { to: PokerLobbyPhase.MENU },
      ],
    },
    [PokerLobbyPhase.PICK_TABLE]: {
      // list_tables already built the table choices (with Back) for the open tables
      run: offRecord(input('Select Table:', lobbyCtxProxy.openTables.tableChoices, { as: lobbyCtxProxy.selectedTable })),
      next: [
        { to: PokerLobbyPhase.MENU, when: state.selectedTable.isChoice(lobbyActions.BACK) },
        { to: PokerLobbyPhase.BUY_IN },
      ],
      onExit: ifElse(
        state.selectedTable.isChoice(lobbyActions.BACK).not(),
        setState({ tableId: state.selectedTable.id.orDefault(state.selectedTable) as any })
      ),
    },
    [PokerLobbyPhase.NEW_TABLE]: {
      run: [
        create_table({ playerName: lobbyCtxProxy.playerName }, { as: lobbyCtxProxy.newTable }),
        setState({ tableId: lobbyCtxProxy.newTable.tableId }),
      ],
      next: PokerLobbyPhase.BUY_IN,
    },
    // The wallet persists across games; below the minimum buy-in the player tops it up first
    [PokerLobbyPhase.BUY_IN]: {
      run: loadBuyInOptions(),
      next: [
        // get_buy_in_options does not spread: its result is in state only under `buyInOptions`
        { to: PokerLobbyPhase.RELOAD, when: output.buyInOptions.and(output.buyInOptions.canAfford.not()) },
        { to: PokerLobbyPhase.DEPOSIT },
      ],
    },
    [PokerLobbyPhase.RELOAD]: {
      run: [
        offRecord(input("Your bankroll is below this table's minimum buy-in. Enter an amount to add (or select preset):",
          [...ReloadChoices, LobbyChoices.BACK], { as: bankrollCtx.reloadChoice })),
        ifElse(
          state.reloadChoice.isChoice(lobbyActions.BACK).not(),
          reload_bankroll({ amount: bankrollCtx.reloadChoice }, { as: bankrollCtx.reload }),
        ),
      ],
      next: [
        { to: PokerLobbyPhase.MENU, when: state.reloadChoice.isChoice(lobbyActions.BACK) },
        { to: PokerLobbyPhase.BUY_IN },
      ],
    },
    [PokerLobbyPhase.DEPOSIT]: {
      run: [
        loadBuyInOptions(),
        offRecord(input('Enter Buy-In amount (or select preset):', bankrollCtx.buyInOptions.choices, { as: bankrollCtx.buyInChoice })),
        deposit_buy_in({
          tableId: state.tableId,
          bbAmount: bankrollCtx.bbAmount.orDefault(20),
          amount: bankrollCtx.buyInChoice.amount.orDefault(bankrollCtx.buyInChoice).orDefault(1000),
        }, { as: bankrollCtx.buyInDeposit }),
        setState({
          selectedBuyIn: bankrollCtx.buyInDeposit.deposited.orDefault(bankrollCtx.buyInChoice.amount).orDefault(bankrollCtx.buyInChoice).orDefault(1000),
        }),
        TableSelected.emit({ tableId: state.tableId, buyIn: state.selectedBuyIn }),
      ],
      next: PokerLobbyPhase.BOOT,
    },
    // Initializes the table unless it already runs (or the session ended)
    [PokerLobbyPhase.BOOT]: { run: buildTableBootStep() },
    [PokerLobbyPhase.EXIT]: { run: handle_user_exit() },
  }, { name: steps.LOBBY_MANAGER, stateKey: LOBBY_PHASE_KEY });
}

export const pokerLobbyAst: CuratorModuleNode = defineModule(modules.LOBBY, {
  description: "Texas Hold'em Lounge Concierge for table selection and dynamic player seating",
}, () => [buildLobbyPhases()]);
