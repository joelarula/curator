import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StoredSession, TokenStore } from './types.js';

export function defaultCredentialsDir(): string {
  return process.env.CURATOR_CREDENTIALS_DIR || path.join(os.homedir(), '.curator', 'credentials');
}

/**
 * One JSON file per (issuer, clientId) session, created with mode 0600 and written
 * atomically (temp file + rename). On Windows the mode is advisory; the file relies
 * on the user profile ACL.
 */
export class FileTokenStore implements TokenStore {
  constructor(private readonly dir: string = defaultCredentialsDir()) {}

  private fileFor(key: string): string {
    return path.join(this.dir, `${createHash('sha256').update(key).digest('hex').slice(0, 32)}.json`);
  }

  async get(key: string): Promise<StoredSession | null> {
    try {
      const record = JSON.parse(await fs.readFile(this.fileFor(key), 'utf8'));
      return record?.key === key ? (record.session as StoredSession) : null;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }

  async set(key: string, session: StoredSession): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const target = this.fileFor(key);
    const tmp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ key, session }, null, 2), { mode: 0o600 });
    await fs.rename(tmp, target);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.fileFor(key), { force: true });
  }

  async keys(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.dir);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw err;
    }
    const keys: string[] = [];
    for (const entry of entries.filter((e) => e.endsWith('.json'))) {
      try {
        const record = JSON.parse(await fs.readFile(path.join(this.dir, entry), 'utf8'));
        if (typeof record?.key === 'string') keys.push(record.key);
      } catch {
        // skip unreadable or partially written files
      }
    }
    return keys;
  }
}

export class MemoryTokenStore implements TokenStore {
  private readonly sessions = new Map<string, StoredSession>();

  async get(key: string) {
    const session = this.sessions.get(key);
    return session ? structuredClone(session) : null;
  }

  async set(key: string, session: StoredSession) {
    this.sessions.set(key, structuredClone(session));
  }

  async delete(key: string) {
    this.sessions.delete(key);
  }

  async keys() {
    return [...this.sessions.keys()];
  }
}
