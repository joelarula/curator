import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

export interface PlayerProfile {
  playerName: string;
  playerId: string;
  createdAt: string;
  updatedAt: string;
}

const PROFILE_DIR = path.join(os.homedir(), '.curator');
const PRIMARY_PROFILE_PATH = path.join(PROFILE_DIR, 'poker_profile.json');
const FALLBACK_PROFILE_PATH = path.resolve(process.cwd(), 'data', 'poker_profile.json');
const LOCAL_STORAGE_KEY = 'curator_poker_profile';

/**
 * Returns the active file path for storing the player profile.
 */
export function getProfileFilePath(): string {
  try {
    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
    }
    return PRIMARY_PROFILE_PATH;
  } catch (_) {
    const fallbackDir = path.dirname(FALLBACK_PROFILE_PATH);
    if (!fs.existsSync(fallbackDir)) {
      try {
        fs.mkdirSync(fallbackDir, { recursive: true });
      } catch (__) {}
    }
    return FALLBACK_PROFILE_PATH;
  }
}

/**
 * Derives a deterministic player identifier from a display name.
 */
export function derivePlayerId(playerName: string): string {
  const slug = (playerName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '');
  return `user_${slug || 'hero'}`;
}

/**
 * Loads the stored player profile from client-side storage (filesystem or localStorage).
 */
export function loadPlayerProfile(customPath?: string): PlayerProfile | null {
  // 1. Browser context check
  if (typeof window !== 'undefined' && (window as any).localStorage) {
    try {
      const raw = (window as any).localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  // 2. Node.js filesystem check
  const filePath = customPath || getProfileFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.playerName === 'string' && parsed.playerName.trim()) {
        return {
          playerName: parsed.playerName.trim(),
          playerId: parsed.playerId || derivePlayerId(parsed.playerName),
          createdAt: parsed.createdAt || new Date().toISOString(),
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    }
  } catch (_) {}

  // 3. Fallback path check if primary was checked
  if (!customPath && filePath !== FALLBACK_PROFILE_PATH) {
    try {
      if (fs.existsSync(FALLBACK_PROFILE_PATH)) {
        const content = fs.readFileSync(FALLBACK_PROFILE_PATH, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed.playerName === 'string' && parsed.playerName.trim()) {
          return {
            playerName: parsed.playerName.trim(),
            playerId: parsed.playerId || derivePlayerId(parsed.playerName),
            createdAt: parsed.createdAt || new Date().toISOString(),
            updatedAt: parsed.updatedAt || new Date().toISOString(),
          };
        }
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Persists the player profile to client-side storage.
 */
export function savePlayerProfile(
  data: { playerName: string; playerId?: string },
  customPath?: string
): PlayerProfile {
  const trimmedName = data.playerName.trim();
  const playerId = data.playerId || derivePlayerId(trimmedName);
  const now = new Date().toISOString();

  const existing = loadPlayerProfile(customPath);
  const profile: PlayerProfile = {
    playerName: trimmedName,
    playerId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  // 1. Browser context
  if (typeof window !== 'undefined' && (window as any).localStorage) {
    try {
      (window as any).localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));
    } catch (_) {}
    return profile;
  }

  // 2. Node.js filesystem
  const filePath = customPath || getProfileFilePath();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf8');
  } catch (err: any) {
    console.warn(`[Poker Profile] Warning: Failed to write profile to ${filePath}: ${err?.message}`);
  }

  return profile;
}

/**
 * Removes the stored player profile from client-side storage.
 */
export function clearPlayerProfile(customPath?: string): void {
  if (typeof window !== 'undefined' && (window as any).localStorage) {
    try {
      (window as any).localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (_) {}
    return;
  }

  const filePath = customPath || getProfileFilePath();
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {}
}

/**
 * Interactively prompts the user in the terminal for their player name.
 */
export async function promptPlayerName(existingRl?: readline.Interface): Promise<string> {
  const rl =
    existingRl ||
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

  const shouldCloseRl = !existingRl;

  console.log('\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m\x1b[36m║               Welcome to Curator Texas Hold\'em Lounge                ║\x1b[0m');
  console.log('\x1b[1m\x1b[36m║                  Autonomous Multi-Agent Game Table                   ║\x1b[0m');
  console.log('\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════════════╝\x1b[0m\n');

  return new Promise((resolve) => {
    const ask = () => {
      rl.question('\x1b[1m\x1b[33mEnter your player name:\x1b[0m ', (answer) => {
        const cleaned = (answer || '').trim();
        if (!cleaned) {
          console.log('\x1b[31mName cannot be empty. Please enter a valid name.\x1b[0m');
          ask();
          return;
        }
        if (cleaned.length < 2 || cleaned.length > 24) {
          console.log('\x1b[31mPlayer name must be between 2 and 24 characters.\x1b[0m');
          ask();
          return;
        }

        if (shouldCloseRl) {
          rl.close();
        }
        resolve(cleaned);
      });
    };
    ask();
  });
}

export interface ResolveIdentityOptions {
  playerName?: string;
  isInteractive?: boolean;
  quiet?: boolean;
  customProfilePath?: string;
}

/**
 * Resolves the player identity using the following priority:
 * 1. Explicit CLI argument (--name <name>) -> updates profile
 * 2. Stored profile (if exists and valid) -> bypasses asking, enters lobby directly
 * 3. Interactive prompt (if interactive TTY) -> asks user name, saves to profile, enters lobby
 * 4. Fallback default ('Hero') -> for non-interactive / automated tests
 */
export async function resolvePlayerIdentity(
  options: ResolveIdentityOptions = {}
): Promise<PlayerProfile> {
  // 1. Explicit CLI flag provided
  if (options.playerName && options.playerName.trim()) {
    const explicitName = options.playerName.trim();
    return savePlayerProfile({ playerName: explicitName }, options.customProfilePath);
  }

  // 2. Check local client storage
  const stored = loadPlayerProfile(options.customProfilePath);
  if (stored && stored.playerName) {
    if (!options.quiet) {
      console.log(`\x1b[32m✔ Welcome back, \x1b[1m${stored.playerName}\x1b[0m\x1b[32m! Entering Texas Hold'em Lounge...\x1b[0m`);
    }
    return stored;
  }

  // 3. Prompt user if interactive
  const isInteractive = options.isInteractive ?? (Boolean(process.stdin.isTTY) && process.env.NODE_ENV !== 'test');
  if (isInteractive) {
    const inputName = await promptPlayerName();
    const saved = savePlayerProfile({ playerName: inputName }, options.customProfilePath);
    if (!options.quiet) {
      console.log(`\x1b[32m✔ Player profile saved. Welcome to the table, \x1b[1m${saved.playerName}\x1b[0m\x1b[32m!\x1b[0m\n`);
    }
    return saved;
  }

  // 4. Non-interactive fallback
  return {
    playerName: 'Hero',
    playerId: 'user_hero',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
