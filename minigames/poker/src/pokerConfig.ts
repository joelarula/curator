/**
 * Host-level poker settings. `createPokerHost` reads them from `poker.config.json` and its own options and
 * hands them to the engine as `$config.poker`, where workflows read them (`pokerConfig` below).
 * Pure: no file access here (the file is found and parsed in env.ts), so plugins and clients can import it.
 */
import { defineConfig, type TypedPathProxy } from './curator.ts';
import { resolveTalkConfig, type PokerTalkConfig } from './engine/tableTalk.ts';
import { POKER_AGENT_PROFILES } from './workflows/agentProfiles.ts';

/** Configuration namespace: workflows read `$config.poker`. */
export const POKER_CONFIG_NAMESPACE = 'poker';

/** Per-agent overrides, keyed by profile id (`viper`, `maddog`, ...). */
export interface PokerAgentConfig {
  chattiness?: number;
}

/** Shape of `poker.config.json` (every key optional). */
export interface PokerConfig {
  talk?: Partial<PokerTalkConfig>;
  agents?: Record<string, PokerAgentConfig>;
  /** Default models, for seats and chatter that do not name their own. */
  models?: { seat?: string; chatter?: string };
}

/** What workflows see as `$config.poker`: everything resolved. */
export interface PokerEngineConfig {
  talk: PokerTalkConfig;
  models: { seat: string; chatter: string };
}

export const DEFAULT_SEAT_MODEL = 'gemini-2.5-flash';

/** Typed handle on `$config.poker` for workflow expressions, args and prompt templates. */
export const pokerConfig: TypedPathProxy<PokerEngineConfig> = defineConfig<PokerEngineConfig>(POKER_CONFIG_NAMESPACE);

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
    talk: resolvePokerTalkConfig(...configs),
    models: { seat, chatter: models.chatter || seat },
  };
}
