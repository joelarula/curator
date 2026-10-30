import { defineTool, type CuratorPluginDefinition } from '@curator/agent-server';
import type { AuthIdentity, AuthPrompt, AuthSessionManager } from '@curator/auth-client';

/** Role allowed to start and cancel sign-ins; a default user role. */
export const AUTH_SIGNIN_ROLE = 'auth_signin';
/** Script recording one sign-in attempt (`context.target`): start it, then wait for its outcome. */
export const AUTH_LOGIN_SCRIPT = 'auth_login';

/** Outcome event of one sign-in: `auth:<target>:done` `{ target, ok, identity? | error? }`. */
export const authDoneEvent = (target: string) => `auth:${target}:done`;

/** Sign-in sessions as the auth tools need them (`AuthSessionManager` satisfies it). */
export type AuthToolsManager = Pick<AuthSessionManager, 'login' | 'idpNames' | 'serviceNames'>;

/** What the auth tools need from a running host (`CuratorHost` satisfies it). */
export interface AuthPluginHost {
  emitEvent(eventName: string, payload?: any): Promise<unknown>;
}

/**
 * Sign-in as a native flow: `auth_login_start` begins a login in this process and returns right away;
 * the login reports progress as host events (Requests in the event log):
 * `auth:verification` (device link + code) / `auth:authorization` (sign-in URL) / `auth:status`, then
 * `auth:<target>:done` and `auth:login` `{ idp, issuer, sub }` (or `auth:failed`). Connector flows waiting
 * for a sign-in resume on `auth:login`. The `auth_login` script records each attempt as a flow.
 */
export function createAuthPlugin(auth: AuthToolsManager): { plugin: CuratorPluginDefinition; attach(host: AuthPluginHost): void } {
  let host: AuthPluginHost | undefined;
  const pending = new Map<string, AbortController>();

  const emit = (name: string, payload: Record<string, any>) => {
    host?.emitEvent(name, payload).catch(() => {});
  };

  const start = (target: string): { target: string; status: 'started' | 'pending' } => {
    if (!host) throw new Error('Auth plugin is not attached to a host; call attach(host) first');
    if (!auth.idpNames().includes(target) && !auth.serviceNames().includes(target)) {
      throw new Error(`"${target}" is neither a configured IdP nor a service`);
    }
    if (pending.has(target)) return { target, status: 'pending' };
    const controller = new AbortController();
    pending.set(target, controller);
    const prompt: AuthPrompt = {
      signal: controller.signal,
      status: (message) => emit('auth:status', { target, message }),
      showVerification: (info) => emit('auth:verification', { target, ...info }),
      showAuthorization: (info) => emit('auth:authorization', { target, ...info }),
    };
    auth
      .login(target, prompt)
      .then((identity: AuthIdentity) => {
        const who = { issuer: identity.issuer, sub: identity.sub, email: identity.email, name: identity.name };
        emit(authDoneEvent(target), { target, ok: true, identity: who });
        emit('auth:login', { idp: target, issuer: identity.issuer, sub: identity.sub });
      })
      .catch((err: any) => {
        const error = controller.signal.aborted ? 'cancelled' : err?.message || String(err);
        emit(authDoneEvent(target), { target, ok: false, error });
        emit('auth:failed', { target, error });
      })
      .finally(() => pending.delete(target));
    return { target, status: 'started' };
  };

  const target = { type: 'object', properties: { target: { type: 'string', description: 'IdP or service name' } }, required: ['target'] };
  const tools = [
    defineTool<{ target: string }>({
      name: 'auth_login_start',
      description: 'Start signing in to an IdP or service; progress and the outcome arrive as auth:* events',
      parameters: target,
      accessLevel: 'safe_write',
      requiredRole: AUTH_SIGNIN_ROLE,
      execute: async (args) => start(args.target),
    }),
    defineTool<{ target: string }>({
      name: 'auth_login_cancel',
      description: 'Cancel a pending sign-in',
      parameters: target,
      accessLevel: 'safe_write',
      requiredRole: AUTH_SIGNIN_ROLE,
      execute: async (args) => {
        const controller = pending.get(args.target);
        controller?.abort(new Error('cancelled'));
        return { target: args.target, cancelled: !!controller };
      },
    }),
  ];

  const loginWorkflow = {
    type: 'Curator_Sequential',
    name: 'auth_login',
    subAgents: [
      { type: 'Curator_Tool', toolName: 'auth_login_start', args: { target: '$context.target' }, as: 'authLogin', spread: false },
      // Device codes expire well within this; the wait ends with the outcome event.
      { type: 'Curator_WaitEvent', eventName: "{{ 'auth:' + $context.target + ':done' }}", timeoutSeconds: 1800 },
    ],
  };

  return {
    attach(h) {
      host = h;
    },
    plugin: {
      name: 'auth',
      version: '1.0.0',
      description: 'Sign-in to IdPs and services as host flows and events',
      roles: [{ name: AUTH_SIGNIN_ROLE, description: 'Starts and cancels sign-ins' }] as any,
      defaultUserRoles: [AUTH_SIGNIN_ROLE],
      scripts: { [AUTH_LOGIN_SCRIPT]: { body: '// Signs in to context.target', ast: loginWorkflow } } as any,
      tools,
    },
  };
}

/** What `createHostAuthManager` needs from a running host (`CuratorHost` satisfies it). */
export interface HostAuthManagerHost {
  triggerAgent(name: string, context?: Record<string, any>): Promise<unknown>;
  runTool(toolName: string, args?: Record<string, any>): Promise<unknown>;
  events: { onEvent(callback: (event: { type: string; payload: any }) => void): () => void };
}

/**
 * The sessions of `auth`, with `login` running through the host's `auth_login` flow: prompts are fed from
 * its events, aborting cancels it. Hand it to a shell (`/auth`) running in the host's process.
 */
export function createHostAuthManager<T extends Pick<AuthSessionManager, 'idpNames' | 'serviceNames' | 'list' | 'logout' | 'whoami'>>(
  auth: T,
  host: HostAuthManagerHost
) {
  return {
    idpNames: () => auth.idpNames(),
    serviceNames: () => auth.serviceNames(),
    list: () => auth.list(),
    logout: (target: string) => auth.logout(target),
    whoami: (target: string) => auth.whoami(target),
    login(target: string, prompt: AuthPrompt): Promise<AuthIdentity> {
      return new Promise((resolve, reject) => {
        const off = host.events.onEvent(({ type, payload }) => {
          if (payload?.target !== target) return;
          if (type === 'auth:verification') prompt.showVerification(payload);
          else if (type === 'auth:authorization') prompt.showAuthorization ? prompt.showAuthorization(payload) : prompt.status?.(`Open ${payload.authorizationUrl}`);
          else if (type === 'auth:status') prompt.status?.(payload.message);
          else if (type === authDoneEvent(target)) {
            off();
            if (payload.ok) resolve(payload.identity);
            else reject(new Error(payload.error || 'sign-in failed'));
          }
        });
        prompt.signal?.addEventListener('abort', () => void host.runTool('auth_login_cancel', { target }).catch(() => {}), { once: true });
        host.triggerAgent(AUTH_LOGIN_SCRIPT, { target }).catch((err) => {
          off();
          reject(err);
        });
      });
    },
  };
}
