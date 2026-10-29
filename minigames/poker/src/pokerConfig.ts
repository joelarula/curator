/**
 * Host-level poker settings. `createPokerHost` reads them from `poker.config.yaml` (or `.yml` / `.json`) and
 * its own options and hands them to the engine as `$config.poker`. A table copies them into
 * `$state.tableSettings` when it boots (`tableSettings` below), so a running game keeps the settings it
 * started with.
 * Pure: no file access here (the file is found and parsed in env.ts), so plugins and clients can import it.
 */
import { createContextProxy, defineConfig, type TypedPathProxy } from './curator.ts';
import { resolveTalkConfig, type PokerTalkConfig } from './engine/tableTalk.ts';
import { POKER_AGENT_PROFILES } from './workflows/agentProfiles.ts';

/** Configuration namespace: workflows read `$config.poker`. */
export const POKER_CONFIG_NAMESPACE = 'poker';

/** Per-agent overrides, keyed by profile id (`viper`, `maddog`, ...). */
export interface PokerAgentConfig {
  chattiness?: number;
}

/** Table defaults; a table created with its own values (lobby, CLI) keeps those. */
export interface PokerTableSettings {
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
}

/** Table rules. */
export interface PokerRulesSettings {
  /** Illegal intents a seat may send back per turn before the engine coerces the action to a legal one. */
  maxTurnRejections: number;
}

export const DEFAULT_TABLE_SETTINGS: PokerTableSettings = { startingChips: 1000, smallBlind: 10, bigBlind: 20, maxSeats: 6 };
export const DEFAULT_RULES_SETTINGS: PokerRulesSettings = { maxTurnRejections: 2 };

/** Shape of `poker.config.yaml` (every key optional). */
export interface PokerConfig {
  table?: Partial<PokerTableSettings>;
  rules?: Partial<PokerRulesSettings>;
  talk?: Partial<PokerTalkConfig>;
  agents?: Record<string, PokerAgentConfig>;
  /** Default models, for seats and chatter that do not name their own. */
  models?: { seat?: string; chatter?: string };
}

/** What workflows see as `$config.poker`: everything resolved. */
export interface PokerEngineConfig {
  table: PokerTableSettings;
  rules: PokerRulesSettings;
  talk: PokerTalkConfig;
  models: { seat: string; chatter: string };
}

export const DEFAULT_SEAT_MODEL = 'gemini-2.5-flash';

/** Typed handle on `$config.poker` for workflow expressions, args and prompt templates. */
export const pokerConfig: TypedPathProxy<PokerEngineConfig> = defineConfig<PokerEngineConfig>(POKER_CONFIG_NAMESPACE);

/**
 * The settings a table booted with (`$state.tableSettings`), else the live `$config.poker`, over the built-in
 * `table` and `rules` sections: `table.*` and `rules.*` are safe to read even where no poker config was set
 * (tests, bare engines). A section given only in part can still miss a field, so give reads a default.
 */
export const tableSettings: TypedPathProxy<PokerEngineConfig> = createContextProxy<PokerEngineConfig>(
  `({ ...${JSON.stringify({ table: DEFAULT_TABLE_SETTINGS, rules: DEFAULT_RULES_SETTINGS })}, ...($state.tableSettings || $config.poker || {}) })`,
);

/** A setting read through `tableSettings` with a default that applies only when it is missing (`??`, so 0 counts). */
export const setting = <T>(path: TypedPathProxy<T>, fallback: T): TypedPathProxy<T> =>
  createContextProxy<T>(`(${path} ?? ${JSON.stringify(fallback)})`);

const chattinessOf = (agents: Record<string, { chattiness?: number }> = {}): Record<string, number> =>
  Object.fromEntries(Object.entries(agents)
    .filter(([, a]) => typeof a?.chattiness === 'number')
    .map(([id, a]) => [id, a.chattiness as number]));

/**
 * Table-talk settings, later layers winning: defaults, the agent profiles' `chattiness`, then each
 * config's `talk` and `agents` overrides (typically the config file, then host options).
 */
export function resolvePokerTalkConfig(...configs: Array<PokerConfig | undefined>): PokerTalkConfig {
  return resolveTalkConfig(
    { seatChattiness: chattinessOf(POKER_AGENT_PROFILES) },
    ...configs.flatMap((c) => (c ? [c.talk, { seatChattiness: chattinessOf(c.agents) }] : [])),
  );
}

/** `$config.poker` from the given layers (later wins) over the defaults. */
export function resolvePokerConfig(...configs: Array<PokerConfig | undefined>): PokerEngineConfig {
  const models = Object.assign({}, ...configs.map((c) => c?.models || {}));
  const seat = models.seat || DEFAULT_SEAT_MODEL;
  return {
    table: Object.assign({}, DEFAULT_TABLE_SETTINGS, ...configs.map((c) => c?.table || {})),
    rules: Object.assign({}, DEFAULT_RULES_SETTINGS, ...configs.map((c) => c?.rules || {})),
    talk: resolvePokerTalkConfig(...configs),
    models: { seat, chatter: models.chatter || seat },
  };
}
