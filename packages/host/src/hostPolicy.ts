import type {
  CuratorDefinitionsPolicy,
  CuratorHostConfig,
  CuratorHostProfile,
  CuratorRetentionPolicy,
} from './types.js';

export interface ResolvedHostPolicy {
  profile: CuratorHostProfile;
  definitions: Required<CuratorDefinitionsPolicy>;
  retention: Required<CuratorRetentionPolicy>;
  astStorage: 'reference' | 'snapshot';
}

const DAY_MS = 24 * 60 * 60 * 1000;

const PROFILE_DEFAULTS: Record<CuratorHostProfile, ResolvedHostPolicy> = {
  server: {
    profile: 'server',
    definitions: { owner: 'database', onDrift: 'keep' },
    retention: { readOnlyRequests: 'keep', readOnlyTtlMs: 30 * DAY_MS },
    astStorage: 'reference',
  },
  embedded: {
    profile: 'embedded',
    definitions: { owner: 'code', onDrift: 'update' },
    retention: { readOnlyRequests: 'keep', readOnlyTtlMs: 30 * DAY_MS },
    astStorage: 'reference',
  },
  ephemeral: {
    profile: 'ephemeral',
    definitions: { owner: 'code', onDrift: 'update' },
    retention: { readOnlyRequests: 'prune', readOnlyTtlMs: DAY_MS },
    astStorage: 'snapshot',
  },
};

/** Merges explicit host config over the defaults of its profile (default profile: 'embedded'). */
export function resolveHostPolicy(config: Partial<CuratorHostConfig> = {}): ResolvedHostPolicy {
  const profile = config.profile ?? 'embedded';
  const base = PROFILE_DEFAULTS[profile];
  if (!base) throw new Error(`Unknown curator host profile '${profile}'`);
  return {
    profile,
    definitions: { ...base.definitions, ...stripUndefined(config.definitions) },
    retention: { ...base.retention, ...stripUndefined(config.retention) },
    astStorage: config.astStorage ?? base.astStorage,
  };
}

function stripUndefined<T extends object>(value: T | undefined): Partial<T> {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
