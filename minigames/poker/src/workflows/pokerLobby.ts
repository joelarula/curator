/**
 * ---
 * id: poker_lobby
 * name: poker_lobby
 * description: Texas Hold'em Lounge Concierge & Table Selection Module
 * ---
 */
import { lobbyCtx as lobbyCtxProxy, bankrollCtx, bootCtx, state } from '../models/pokerContext.ts';
import {
  defineModule,
  defineSubroutine,
  seq,
  input,
  ifElse,
  stateMachine,
  whileLoop,
  setState,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables, pokerPredicates } from '../composables/pokerComposables.ts';
import type { PokerLobbyContext, PokerBootContext } from '../models/pokerContext.ts';
import { PokerLobbyPhase, LOBBY_PHASE_KEY } from '../models/pokerContracts.ts';
import { LobbyReady, AwaitingPlayers, PlayerJoined, TableReady, TableSelected } from '../models/pokerEvents.ts';
import { PokerLobbyAction, LobbyChoices, ReloadChoices } from '../models/pokerLobbyMenu.ts';

const {
  gameState,
  steps,
  boot_table,
  join_lobby,
  list_tables,
  lobby_menu,
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
  boot_table(),
  LobbyReady.emit({ tableId: gameState.tableId }),
  whileLoop(
    pokerPredicates.table_needs_players,
    seq(steps.WAIT_FOR_PLAYERS, [
      AwaitingPlayers.emit({ tableId: gameState.tableId, seatedCount: gameState.players.length }),
      PlayerJoined.wait(bootCtx.joinRequest),
      join_lobby(bootCtx.joinRequest),
    ]),
  ),
  // Seats only (no chips or cards): projected into the table's poker:hasPlayer triples
  setState<PokerLobbyContext>((c) => ({
    seatedPlayers: (c.state?.gameState?.players || []).map((p: any) => ({ id: p.id, name: p.name, isHuman: Boolean(p.isHuman) })),
  })),
  TableReady.emit({ tableId: gameState.tableId, playerCount: gameState.players.length }),
]);

/**
 * Composable conditional step that boots the table if state has not been initialized.
 */
export function buildTableBootStep() {
  return ifElse<PokerBootContext>(
    (c) => !c.state?.gameState && !c.sessionEnded,
    seq(steps.BOOT_TABLE, [
      // The boot subroutine is an isolated child call: hand it the run's table config through state
      setState<PokerBootContext>((c) => ({
        tableConfig: {
          tableId: c.tableId,
          startingChips: c.startingChips,
          sbAmount: c.sbAmount,
          bbAmount: c.bbAmount,
          maxSeats: c.maxSeats,
          players: c.players,
          playerName: c.playerName,
        },
      })),
      bootTableSub(),
    ]),
  );
}

/** True when a menu answer (choice object or bare id) is the given option. */
const picked = (answer: unknown, id: string) => `(${answer}.id == '${id}' or ${answer} == '${id}' or ${answer}.value == '${id}')`;

const loadBuyInOptions = () =>
  get_buy_in_options({ bbAmount: `${bankrollCtx.bbAmount} || 20` }, { as: bankrollCtx.buyInOptions });

/**
 * The lounge as a Bevy-style state machine: menu → pick or create a table → buy in → boot the table.
 * The active state is mirrored into `$state.lobbyPhase`.
 */
export function buildLobbyPhases() {
  return stateMachine([
    // A table chosen up front (or an ended session) skips the menu
    { to: PokerLobbyPhase.BOOT, when: `${lobbyCtxProxy.tableId} or ${lobbyCtxProxy.sessionEnded}` },
    { to: PokerLobbyPhase.MENU },
  ], {
    [PokerLobbyPhase.MENU]: {
      run: [
        list_tables({}, { as: lobbyCtxProxy.openTables }),
        input('Lobby Options:', [
          LobbyChoices.NEW,
          { ...LobbyChoices.RESUME, when: `${lobbyCtxProxy.openTables.tables.length} > 0` },
          LobbyChoices.EXIT,
        ], { as: lobbyCtxProxy.lobbyChoice }),
      ],
      next: [
        { to: PokerLobbyPhase.NEW_TABLE, when: picked(state.lobbyChoice, lobbyActions.NEW) },
        { to: PokerLobbyPhase.PICK_TABLE, when: picked(state.lobbyChoice, lobbyActions.RESUME) },
        { to: PokerLobbyPhase.EXIT, when: picked(state.lobbyChoice, lobbyActions.EXIT) },
        { to: PokerLobbyPhase.MENU },
      ],
    },
    [PokerLobbyPhase.PICK_TABLE]: {
      run: [
        lobby_menu({ tables: String(lobbyCtxProxy.openTables.tables) }, { as: lobbyCtxProxy.lobbyMenu }),
        input('Select Table:', String(lobbyCtxProxy.lobbyMenu.tableChoices), { as: lobbyCtxProxy.selectedTable }),
      ],
      next: [
        { to: PokerLobbyPhase.MENU, when: picked(state.selectedTable, lobbyActions.BACK) },
        { to: PokerLobbyPhase.BUY_IN },
      ],
      onExit: ifElse(`not ${picked(state.selectedTable, lobbyActions.BACK)}`,
        setState({ tableId: `${state.selectedTable.id} || ${state.selectedTable}` })),
    },
    [PokerLobbyPhase.NEW_TABLE]: {
      run: [
        create_table({ playerName: String(lobbyCtxProxy.playerName) }, { as: lobbyCtxProxy.newTable }),
        setState<PokerLobbyContext>((c) => ({ tableId: c.newTable?.tableId || `poker:table_${crypto.randomUUID()}` })),
      ],
      next: PokerLobbyPhase.BUY_IN,
    },
    // The wallet persists across games; below the minimum buy-in the player tops it up first
    [PokerLobbyPhase.BUY_IN]: {
      run: loadBuyInOptions(),
      next: [
        { to: PokerLobbyPhase.RELOAD, when: 'output and not output.canAfford' },
        { to: PokerLobbyPhase.DEPOSIT },
      ],
    },
    [PokerLobbyPhase.RELOAD]: {
      run: [
        input("Your bankroll is below this table's minimum buy-in. Enter an amount to add (or select preset):",
          ReloadChoices, { as: bankrollCtx.reloadChoice }),
        reload_bankroll({ amount: String(bankrollCtx.reloadChoice) }, { as: bankrollCtx.reload }),
      ],
      next: PokerLobbyPhase.BUY_IN,
    },
    [PokerLobbyPhase.DEPOSIT]: {
      run: [
        loadBuyInOptions(),
        input('Enter Buy-In amount (or select preset):', String(bankrollCtx.buyInOptions.choices), { as: bankrollCtx.buyInChoice }),
        deposit_buy_in({
          tableId: state.tableId,
          bbAmount: `${bankrollCtx.bbAmount} || 20`,
          amount: `${bankrollCtx.buyInChoice.amount} || ${bankrollCtx.buyInChoice} || 1000`,
        }, { as: bankrollCtx.buyInDeposit }),
        setState({
          selectedBuyIn: `${bankrollCtx.buyInDeposit.deposited} || ${bankrollCtx.buyInChoice.amount} || ${bankrollCtx.buyInChoice} || 1000`,
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
