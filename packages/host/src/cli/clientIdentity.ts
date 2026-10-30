import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { ShellAuthManager } from '../types.js';

/** Local identity of the person using a client app (CLI game, miniapp shell, ...). */
export interface ClientIdentity {
  userId: string;
  displayName: string;
  /** Where the identity came from on this run. */
  source: 'flag' | 'auth' | 'stored' | 'prompt' | 'default';
  createdAt: string;
  updatedAt: string;
  prefs?: Record<string, unknown>;
}

type StoredIdentity = Omit<ClientIdentity, 'source'>;

export function defaultIdentityDir(): string {
  return process.env.CURATOR_IDENTITY_DIR || path.join(os.homedir(), '.curator', 'identities');
}

/** Derives a deterministic local user id from a display name (`Bob The Shark!` -> `user_bob_the_shark`). */
export function deriveLocalUserId(displayName: string, fallbackSlug = 'guest'): string {
  const slug = (displayName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '');
  return `user_${slug || fallbackSlug}`;
}

/** One JSON identity per app id under the identity dir (`~/.curator/identities/<appId>.json`). */
export class FileIdentityStore {
  constructor(private readonly dir: string = defaultIdentityDir()) {}

  pathFor(appId: string): string {
    return path.join(this.dir, `${appId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  }

  load(appId: string): StoredIdentity | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.pathFor(appId), 'utf8'));
      const displayName = typeof parsed?.displayName === 'string' ? parsed.displayName.trim() : '';
      if (!displayName) return null;
      const now = new Date().toISOString();
      return {
        displayName,
        userId: parsed.userId || deriveLocalUserId(displayName),
        createdAt: parsed.createdAt || now,
        updatedAt: parsed.updatedAt || now,
        ...(parsed.prefs ? { prefs: parsed.prefs } : {}),
      };
    } catch {
      return null;
    }
  }

  save(appId: string, data: { displayName: string; userId?: string; prefs?: Record<string, unknown> }): StoredIdentity {
    const displayName = data.displayName.trim();
    const existing = this.load(appId);
    const now = new Date().toISOString();
    const identity: StoredIdentity = {
      displayName,
      userId: data.userId || deriveLocalUserId(displayName),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...((data.prefs ?? existing?.prefs) ? { prefs: data.prefs ?? existing?.prefs } : {}),
    };
    const file = this.pathFor(appId);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(identity, null, 2), 'utf8');
    } catch (err: any) {
      console.warn(`[Client Identity] Failed to write identity to ${file}: ${err?.message}`);
    }
    return identity;
  }

  clear(appId: string): void {
    try {
      fs.rmSync(this.pathFor(appId), { force: true });
    } catch {}
  }
}

export interface DisplayNamePromptOptions {
  /** Lines printed before the first question (e.g. an app banner). */
  banner?: string[];
  label?: string;
  /** Returns an error message for an invalid name, or null when it is accepted. */
  validate?: (name: string) => string | null;
  rl?: readline.Interface;
}

export function validateDisplayName(name: string, min = 2, max = 24): string | null {
  if (!name) return 'Name cannot be empty. Please enter a valid name.';
  if (name.length < min || name.length > max) return `Name must be between ${min} and ${max} characters.`;
  return null;
}

/** Asks for a display name in the terminal until it passes validation. */
export async function promptDisplayName(options: DisplayNamePromptOptions = {}): Promise<string> {
  const rl = options.rl || readline.createInterface({ input: process.stdin, output: process.stdout });
  const validate = options.validate || ((name: string) => validateDisplayName(name));
  const label = options.label || 'Enter your name:';

  for (const line of options.banner || []) console.log(line);

  try {
    while (true) {
      const answer = await new Promise<string>((resolve) => rl.question(`\x1b[1m\x1b[33m${label}\x1b[0m `, resolve));
      const cleaned = (answer || '').trim();
      const error = validate(cleaned);
      if (!error) return cleaned;
      console.log(`\x1b[31m${error}\x1b[0m`);
    }
  } finally {
    if (!options.rl) rl.close();
  }
}

export interface ResolveClientIdentityOptions {
  /** Identity key, e.g. `poker`. */
  appId: string;
  /** Explicit name (e.g. `--name`); saved as the new identity. */
  displayName?: string;
  /** When logged in to `authTarget`, the IdP identity wins over the stored identity. */
  auth?: ShellAuthManager;
  authTarget?: string;
  interactive?: boolean;
  quiet?: boolean;
  store?: FileIdentityStore;
  prompt?: Omit<DisplayNamePromptOptions, 'rl'>;
  /** Identity used when nothing is stored and no prompt is possible. */
  fallbackName?: string;
  /** Greeting printed for a stored (`stored`) or newly entered (`prompt`) identity. */
  greet?: (identity: ClientIdentity) => string;
}

function defaultGreet(identity: ClientIdentity): string {
  return identity.source === 'prompt'
    ? `\x1b[32m✔ Name saved. Welcome, \x1b[1m${identity.displayName}\x1b[0m\x1b[32m!\x1b[0m\n`
    : `\x1b[32m✔ Welcome back, \x1b[1m${identity.displayName}\x1b[0m\x1b[32m!\x1b[0m`;
}

/**
 * Resolves who is using the client app:
 * 1. Explicit name -> saved to the identity
 * 2. Authenticated identity (`auth.whoami(authTarget)`)
 * 3. Stored identity
 * 4. Interactive prompt (TTY) -> saved to the identity
 * 5. Fallback name (non-interactive / tests)
 */
export async function resolveClientIdentity(options: ResolveClientIdentityOptions): Promise<ClientIdentity> {
  const store = options.store || new FileIdentityStore();
  const greet = options.greet || defaultGreet;
  const say = (identity: ClientIdentity) => {
    if (!options.quiet) console.log(greet(identity));
    return identity;
  };

  const explicit = options.displayName?.trim();
  if (explicit) {
    return { ...store.save(options.appId, { displayName: explicit }), source: 'flag' };
  }

  if (options.auth && options.authTarget) {
    const identity = await options.auth.whoami(options.authTarget).catch(() => null);
    if (identity) {
      const now = new Date().toISOString();
      const displayName = identity.name || identity.email || identity.sub;
      return {
        displayName,
        userId: deriveLocalUserId(displayName),
        source: 'auth',
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  const stored = store.load(options.appId);
  if (stored) return say({ ...stored, source: 'stored' });

  const interactive = options.interactive ?? (Boolean(process.stdin.isTTY) && process.env.NODE_ENV !== 'test');
  if (interactive) {
    const name = await promptDisplayName(options.prompt);
    return say({ ...store.save(options.appId, { displayName: name }), source: 'prompt' });
  }

  const fallbackName = options.fallbackName || 'Guest';
  const now = new Date().toISOString();
  return {
    displayName: fallbackName,
    userId: deriveLocalUserId(fallbackName),
    source: 'default',
    createdAt: now,
    updatedAt: now,
  };
}
