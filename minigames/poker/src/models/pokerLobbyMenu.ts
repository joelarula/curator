/**
 * Pure lobby menu models: lounge actions, menu choices and table selection choices.
 * No I/O; consumed by the poker_list_tables tool, the lobby workflow, session discovery and the REPL shell.
 */

export const PokerLobbyAction = {
  NEW: 'new',
  RESUME: 'resume',
  EXIT: 'exit',
  BACK: 'back',
} as const;

export type PokerLobbyActionType = (typeof PokerLobbyAction)[keyof typeof PokerLobbyAction];

export interface PokerLobbyChoice {
  id: PokerLobbyActionType;
  label: string;
  description?: string;
  aliases: string[];
}

export interface PokerReloadChoice {
  id: string;
  label: string;
  value: number;
  aliases: string[];
}

export interface PokerTableChoice {
  /** The table id (or `back`); the generic choice key matched by the workflow. */
  id: string;
  title: string;
  label: string;
  aliases: string[];
}

export interface PokerLobbyTable {
  tableId: string;
  title: string;
}

export interface PokerLobbyMenu {
  lobbyChoices: PokerLobbyChoice[];
  tableChoices: PokerTableChoice[];
}

/**
 * Lounge menu entries. Workflows list them inline and gate them with `when`;
 * positional numbers ("1", "2", ...) are resolved by the client shell, so they are not baked into aliases here.
 */
export const LobbyChoices: Record<'NEW' | 'RESUME' | 'EXIT', PokerLobbyChoice> = {
  NEW: {
    id: PokerLobbyAction.NEW,
    label: 'New Game - Start fresh table',
    description: 'Start fresh table',
    aliases: ['n', 'new'],
  },
  RESUME: {
    id: PokerLobbyAction.RESUME,
    label: 'Resume Game - Select from active/paused tables',
    description: 'Select from active/paused tables',
    aliases: ['r', 'resume', 'continue'],
  },
  EXIT: {
    id: PokerLobbyAction.EXIT,
    label: 'Exit - Quit session',
    description: 'Quit session',
    aliases: ['q', 'exit', 'quit'],
  },
};

/** Precomputed lounge menu (with numeric aliases and table count) for callers outside the AST workflow. */
export function getLobbyChoices(hasUnfinishedGames: boolean = false, count?: number): PokerLobbyChoice[] {
  const resume: PokerLobbyChoice = {
    ...LobbyChoices.RESUME,
    label: count !== undefined && count > 0 ? `${LobbyChoices.RESUME.label} (${count} available)` : LobbyChoices.RESUME.label,
  };
  const choices: PokerLobbyChoice[] = [LobbyChoices.NEW, ...(hasUnfinishedGames ? [resume] : []), LobbyChoices.EXIT];
  return choices.map((c, idx) => ({ ...c, aliases: [String(idx + 1), ...c.aliases] }));
}

export const DEFAULT_LOBBY_CHOICES = getLobbyChoices(false);

/**
 * Standardizes mapping of table conversations to interactive selection choices across
 * the lobby menu, session discovery, and REPL shell.
 */
export function formatTableChoices(
  tables: Array<{ id?: string | number; tableId?: string | number; title?: string }>,
  options: { includeBack?: boolean } = { includeBack: true }
): PokerTableChoice[] {
  const choices: PokerTableChoice[] = tables.map((t, idx) => {
    const tableId = String(t.tableId || t.id || idx + 1);
    const title = t.title || `Table #${tableId}`;
    const numIdx = String(idx + 1);
    const aliases = numIdx === tableId ? [tableId] : [numIdx, tableId];
    return {
      id: tableId,
      title,
      label: `Table #${tableId} (${title})`,
      aliases,
    };
  });

  if (options?.includeBack !== false) {
    const backIdx = choices.length + 1;
    choices.push({
      id: PokerLobbyAction.BACK,
      title: 'Back to Lounge Options',
      label: '« Back to Lounge Options',
      aliases: [String(backIdx), 'back', 'b', 'cancel'],
    });
  }

  return choices;
}

/** Lobby menu for a set of resumable tables: Resume is offered only when there is something to resume. */
export function buildLobbyMenu(tables: PokerLobbyTable[] = []): PokerLobbyMenu {
  return {
    lobbyChoices: getLobbyChoices(tables.length > 0, tables.length),
    tableChoices: formatTableChoices(tables),
  };
}

/** Wallet top-up presets; the prompt also accepts any free-form amount ("7500", "$7,500", "10k"). */
export const ReloadChoices: PokerReloadChoice[] = [
  { id: 'small', label: '$1,000', value: 1000, aliases: ['small', '1k'] },
  { id: 'standard', label: '$5,000 [Recommended]', value: 5000, aliases: ['standard', '5k'] },
  { id: 'large', label: '$10,000', value: 10000, aliases: ['large', '10k'] },
];
