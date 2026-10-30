import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { OAuthError } from './errors.js';

interface PendingRedirect {
  resolve(params: URLSearchParams): void;
  reject(err: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  cleanup(): void;
}

/**
 * Authorization responses waiting for their callback, keyed by `state`. The loopback listener
 * or a web app's callback route delivers them; unknown states are ignored (CSRF protection).
 */
export class RedirectRegistry {
  private readonly pending = new Map<string, PendingRedirect>();

  expect(state: string, timeoutMs: number, signal?: AbortSignal): Promise<URLSearchParams> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
      const onAbort = () => finish(() => reject(signal!.reason ?? new Error('Aborted')));
      const finish = (settle: () => void) => {
        const entry = this.pending.get(state);
        if (!entry) return;
        entry.cleanup();
        settle();
      };
      const timer = setTimeout(
        () => finish(() => reject(new OAuthError('expired_token', 'Sign-in was not completed in time'))),
        timeoutMs
      );
      timer.unref?.();
      this.pending.set(state, {
        resolve: (params) => finish(() => resolve(params)),
        reject: (err) => finish(() => reject(err)),
        timer,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          this.pending.delete(state);
        },
      });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Hands a callback (full URL, query string or params) to the flow that issued its `state`. */
  deliver(callback: string | URL | URLSearchParams): boolean {
    const params =
      callback instanceof URLSearchParams
        ? callback
        : callback instanceof URL
          ? callback.searchParams
          : /^[a-z][a-z0-9+.-]*:\/\//i.test(callback)
            ? new URL(callback).searchParams
            : new URLSearchParams(callback.replace(/^\?/, ''));
    const state = params.get('state');
    const entry = state ? this.pending.get(state) : undefined;
    if (!entry) return false;
    entry.resolve(params);
    return true;
  }

  get size(): number {
    return this.pending.size;
  }
}

export interface LoopbackListener {
  redirectUri: string;
  close(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function isLoopbackRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;line-height:1.5"><h2>${title}</h2><p>${body}</p></body>`;

/**
 * RFC 8252 loopback redirect receiver for CLI/REPL logins. Listens on 127.0.0.1 (or the
 * host/port/path of a registered loopback redirect URI) and forwards callbacks to `registry`.
 */
export async function startLoopbackListener(registry: RedirectRegistry, redirectUri?: string): Promise<LoopbackListener> {
  const target = new URL(redirectUri ?? 'http://127.0.0.1:0/callback');
  const host = target.hostname.replace(/^\[|\]$/g, '');
  const path = target.pathname || '/callback';

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://loopback');
    if (req.method !== 'GET' || url.pathname !== path) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const delivered = registry.deliver(url.searchParams);
    const failed = url.searchParams.get('error');
    res.writeHead(delivered ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(
      !delivered
        ? page('Sign-in not recognized', 'This sign-in link is unknown or has expired. Start the login again.')
        : failed
          ? page('Sign-in failed', 'The identity provider reported an error. You can close this tab.')
          : page('Signed in', 'You can close this tab and return to Curator.')
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(target.port || 0), host, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    redirectUri: `http://${target.hostname}:${port}${path}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
