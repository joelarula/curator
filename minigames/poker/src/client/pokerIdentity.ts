import { resolveClientIdentity, validateDisplayName, type FileIdentityStore } from '../curatorHost.ts';

export interface PlayerIdentity {
  playerName: string;
  playerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResolveIdentityOptions {
  playerName?: string;
  isInteractive?: boolean;
  quiet?: boolean;
  store?: FileIdentityStore;
}

const POKER_BANNER = [
  '\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════════════╗\x1b[0m',
  '\x1b[1m\x1b[36m║               Welcome to Curator Texas Hold\'em Lounge                ║\x1b[0m',
  '\x1b[1m\x1b[36m║                  Autonomous Multi-Agent Game Table                   ║\x1b[0m',
  '\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════════════╝\x1b[0m\n',
];

/** Resolves the player through the host client identity (`~/.curator/identities/poker.json`). */
export async function resolvePlayerIdentity(options: ResolveIdentityOptions = {}): Promise<PlayerIdentity> {
  const identity = await resolveClientIdentity({
    appId: 'poker',
    displayName: options.playerName,
    interactive: options.isInteractive,
    quiet: options.quiet,
    store: options.store,
    fallbackName: 'Hero',
    prompt: {
      banner: POKER_BANNER,
      label: 'Enter your player name:',
      validate: (name) => validateDisplayName(name, 2, 24),
    },
    greet: (p) =>
      p.source === 'prompt'
        ? `\x1b[32m✔ Player name saved. Welcome to the table, \x1b[1m${p.displayName}\x1b[0m\x1b[32m!\x1b[0m\n`
        : `\x1b[32m✔ Welcome back, \x1b[1m${p.displayName}\x1b[0m\x1b[32m! Entering Texas Hold'em Lounge...\x1b[0m`,
  });

  return {
    playerName: identity.displayName,
    playerId: identity.userId,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  };
}
