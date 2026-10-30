import { spawn } from 'node:child_process';
import type {
  AuthRequiredEventPayload,
  ShellAuthIdentity,
  ShellAuthManager,
  ShellAuthPrompt,
  ShellAuthSessionInfo,
  ShellAuthorizationInfo,
  ShellVerificationInfo,
} from '../types.js';

export interface ShellAuthOptions {
  openBrowser?: boolean;
  autoLogin?: boolean;
  log?: (line: string) => void;
  /** Called after background output (login finished/failed) so the REPL can redraw its prompt. */
  onAsyncOutput?: () => void;
  /** Called after a successful login (e.g. to re-sync services that were waiting for it). */
  onLogin?: (target: string, identity: ShellAuthIdentity) => void | Promise<void>;
}

/** Opens an http(s) URL in the system browser without going through a shell. */
export function openInBrowser(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const href = parsed.toString();
  const [command, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', href]]
      : process.platform === 'darwin'
        ? ['open', [href]]
        : ['xdg-open', [href]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true, shell: false });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function isAuthRequiredError(err: any): err is { code: 'AUTH_REQUIRED'; service?: string; idp?: string; message: string } {
  return err?.code === 'AUTH_REQUIRED';
}

/**
 * REPL side of multi-IdP auth: `/auth` subcommands, background device-flow logins
 * (several IdPs can be pending at once), and reactions to `auth:required`.
 */
export class ShellAuthController {
  private readonly pending = new Map<string, AbortController>();
  private readonly hinted = new Set<string>();
  private readonly log: (line: string) => void;

  constructor(
    private readonly auth: ShellAuthManager,
    private readonly options: ShellAuthOptions = {}
  ) {
    this.log = options.log ?? ((line) => console.log(line));
  }

  static readonly usage = '[list|login|logout|whoami|cancel] [idp|service]';

  async command(action = 'list', target?: string): Promise<void> {
    switch (action) {
      case 'list':
      case 'ls':
      case 'status':
        return this.printList();
      case 'login':
        if (!target) return this.log(`\x1b[33mUsage: /auth login <${this.targets().join('|') || 'idp|service'}>\x1b[0m`);
        this.startLogin(target);
        return;
      case 'logout':
        if (!target) return this.log('\x1b[33mUsage: /auth logout <idp|service>\x1b[0m');
        this.cancel(target);
        await this.auth.logout(target);
        this.log(`\x1b[32m[auth]\x1b[0m Signed out of ${target}`);
        return;
      case 'whoami': {
        const targets = target ? [target] : this.auth.idpNames();
        for (const t of targets) {
          const identity = await this.auth.whoami(t);
          this.log(`  ${t.padEnd(16)} ${identity ? formatIdentity(identity) : '\x1b[90mnot signed in\x1b[0m'}`);
        }
        return;
      }
      case 'cancel':
        if (!this.cancel(target)) this.log('\x1b[90m[auth] No pending login to cancel\x1b[0m');
        return;
      default:
        this.log(`\x1b[33mUsage: /auth ${ShellAuthController.usage}\x1b[0m`);
    }
  }

  /** Starts a device-flow login in the background; the REPL stays usable while the user signs in. */
  startLogin(target: string): Promise<ShellAuthIdentity | null> {
    if (this.pending.has(target)) {
      this.log(`\x1b[90m[auth] Login for ${target} is already in progress\x1b[0m`);
      return Promise.resolve(null);
    }
    const controller = new AbortController();
    this.pending.set(target, controller);

    const prompt: ShellAuthPrompt = {
      signal: controller.signal,
      status: (message) => this.log(`\x1b[90m[auth] ${message}\x1b[0m`),
      showVerification: (info) => this.showVerification(info),
      showAuthorization: (info) => this.showAuthorization(info),
    };

    return this.auth
      .login(target, prompt)
      .then((identity) => {
        this.hinted.clear();
        this.log(`\x1b[32m✔ [auth] Signed in to ${target} as ${formatIdentity(identity)}\x1b[0m`);
        Promise.resolve(this.options.onLogin?.(target, identity)).catch((err: any) =>
          this.log(`\x1b[31m[auth] After-login step failed: ${err?.message || err}\x1b[0m`)
        );
        return identity;
      })
      .catch((err: any) => {
        const message = controller.signal.aborted ? 'cancelled' : err?.message || String(err);
        this.log(`\x1b[31m✖ [auth] Login to ${target} failed: ${message}\x1b[0m`);
        return null;
      })
      .finally(() => {
        this.pending.delete(target);
        this.options.onAsyncOutput?.();
      });
  }

  /** Cancels one pending login, or all when no target is given. Returns whether anything was cancelled. */
  cancel(target?: string): boolean {
    const targets = target ? [target] : [...this.pending.keys()];
    let cancelled = false;
    for (const t of targets) {
      const controller = this.pending.get(t);
      if (controller) {
        controller.abort(new Error('cancelled'));
        cancelled = true;
      }
    }
    return cancelled;
  }

  pendingLogins(): string[] {
    return [...this.pending.keys()];
  }

  /** Reacts to an `auth:required` event or AUTH_REQUIRED error: hint once, or log in when autoLogin is on. */
  handleAuthRequired(payload: Partial<AuthRequiredEventPayload> | undefined): void {
    const service = payload?.service;
    if (!service) return;
    if (this.pending.has(service) || (payload?.idp && this.pending.has(payload.idp))) return;
    if (this.options.autoLogin && this.targets().includes(service)) {
      this.startLogin(service);
      return;
    }
    if (this.hinted.has(service)) return;
    this.hinted.add(service);
    const via = payload?.idp ? ` (IdP ${payload.idp})` : '';
    this.log(`\x1b[33m[auth] "${service}" needs sign-in${via}. Run /auth login ${service}\x1b[0m`);
    this.options.onAsyncOutput?.();
  }

  private showAuthorization(info: ShellAuthorizationInfo): void {
    const forService = info.service ? ` for "${info.service}"` : '';
    this.log('');
    this.log(`\x1b[1m\x1b[36m[auth] Sign in to ${info.idp}${forService}\x1b[0m \x1b[90m(${info.issuer})\x1b[0m`);
    this.log(`  Open:  \x1b[36m${info.authorizationUrl}\x1b[0m`);
    this.log(`  \x1b[90mThe browser returns to ${info.redirectUri} (/auth cancel to abort)\x1b[0m`);
    this.log('');
    if (this.options.openBrowser) openInBrowser(info.authorizationUrl);
    this.options.onAsyncOutput?.();
  }

  private showVerification(info: ShellVerificationInfo): void {
    const link = info.verificationUriComplete ?? info.verificationUri;
    const forService = info.service ? ` for "${info.service}"` : '';
    this.log('');
    this.log(`\x1b[1m\x1b[36m[auth] Sign in to ${info.idp}${forService}\x1b[0m \x1b[90m(${info.issuer})\x1b[0m`);
    this.log(`  Open:  \x1b[36m${link}\x1b[0m`);
    this.log(`  Code:  \x1b[1m\x1b[33m${info.userCode}\x1b[0m   \x1b[90m(expires in ${Math.max(1, Math.round(info.expiresIn / 60))} min, /auth cancel to abort)\x1b[0m`);
    this.log('');
    if (this.options.openBrowser) openInBrowser(link);
    this.options.onAsyncOutput?.();
  }

  private async printList(): Promise<void> {
    const sessions: ShellAuthSessionInfo[] = await this.auth.list();
    this.log('\n\x1b[1m\x1b[36m=== Auth Sessions ===\x1b[0m');
    if (sessions.length === 0) {
      this.log('\x1b[90m  No IdPs configured (~/.curator/auth.json)\x1b[0m');
    }
    const now = Date.now();
    for (const s of sessions) {
      const state = this.pending.has(s.idp)
        ? '\x1b[33m… signing in\x1b[0m'
        : s.loggedIn
          ? `\x1b[32m✔\x1b[0m ${s.identity ? formatIdentity(s.identity) : 'signed in'}`
          : '\x1b[90m✖ not signed in\x1b[0m';
      this.log(`  \x1b[1m${s.idp.padEnd(14)}\x1b[0m ${state}  \x1b[90m${s.issuer}\x1b[0m`);
      if (s.services.length) this.log(`    services: ${s.services.join(', ')}`);
      for (const t of s.tokens) {
        const expiry = t.expiresAt ? `${Math.round((t.expiresAt - now) / 60000)} min` : 'no expiry';
        this.log(`    ${t.valid ? '\x1b[32m●\x1b[0m' : '\x1b[90m○\x1b[0m'} ${t.resource === '*' ? '(all services)' : t.resource}  \x1b[90m${t.valid ? expiry : 'expired'}\x1b[0m`);
      }
    }
    const pendingServices = this.pendingLogins().filter((t) => !sessions.some((s) => s.idp === t));
    if (pendingServices.length) this.log(`  \x1b[33mpending: ${pendingServices.join(', ')}\x1b[0m`);
    this.log('');
  }

  private targets(): string[] {
    return [...this.auth.idpNames(), ...this.auth.serviceNames()];
  }
}

function formatIdentity(identity: ShellAuthIdentity): string {
  return identity.email || identity.name || identity.sub;
}
