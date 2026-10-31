import { CuratorEngine } from '@curator/agent-server';
import { createCuratorHost, type CuratorHost } from '@curator/host';
import { createMcpServer, createUserActorMapper, emailAllowList, type CuratorMcpInstance } from '@curator/mcp-server';
import { createGoogleIdTokenVerifier, createJwtVerifier, type JwtVerifierOptions } from '@curator/auth-client';
import { WEB_READER_ROLE, webScrapePlugin } from './webScrapePlugin.js';
import type { SafeFetchOptions } from '@curator/plugin-scraper';

export const GOOGLE_ISSUER = 'https://accounts.google.com';

export interface BlueprintServerOptions {
  /** Our Google OAuth client id(s) (web, device): every accepted id_token must name one as `aud`. */
  googleClientId: string | string[];
  /** Emails (`a@x.com`) or domains (`@x.com`) admitted; everyone else gets 401. */
  allowedEmails: string[];
  port?: number;
  host?: string;
  publicUrl?: string;
  databasePath: string;
  /** Overrides for the token verifier (tests point it at a local JWKS and issuer). */
  verifier?: Partial<JwtVerifierOptions> & { issuers?: string[] };
  fetchOptions?: SafeFetchOptions;
  /** Host log level (default `warn`). */
  logLevel?: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface BlueprintServer {
  host: CuratorHost;
  mcp: CuratorMcpInstance;
  url: string;
  close(): Promise<void>;
}

/**
 * The blueprint server: a Curator host whose only exposed tool is `web_scrape`, served over MCP
 * Streamable HTTP. Callers present a Google id_token (verified against Google's JWKS, audience =
 * our client id); admitted users become Curator users with the `web_reader` role in this project,
 * and each call is a Request they own.
 */
export async function createBlueprintServer(options: BlueprintServerOptions): Promise<BlueprintServer> {
  const clientIds = (Array.isArray(options.googleClientId) ? options.googleClientId : [options.googleClientId]).filter(Boolean);
  if (clientIds.length === 0) throw new Error('blueprint server needs GOOGLE_CLIENT_ID and/or CLIENT_ID_BLUEPRINT');
  if (options.allowedEmails.length === 0) {
    throw new Error('blueprint server needs allowedEmails (BLUEPRINT_ALLOWED_EMAILS or blueprint-server.config.yaml, e.g. --profile dev)');
  }

  // Own engine: the server exposes exactly its plugin, independent of any other host in the process.
  const engine = new CuratorEngine();
  const host = await createCuratorHost({
    name: 'blueprint-server',
    projectId: 'blueprint-server',
    projectName: 'Blueprint Server',
    logLevel: options.logLevel ?? 'warn',
    curatorDb: { path: options.databasePath },
    registerPlugins: async () => {
      engine.registerPlugin(webScrapePlugin(options.fetchOptions));
      return engine;
    },
  } as any);
  await host.seed();

  const verifier = options.verifier?.jwksUri
    ? createJwtVerifier({
        issuers: options.verifier.issuers ?? [GOOGLE_ISSUER],
        audience: clientIds,
        requireVerifiedEmail: true,
        ...options.verifier,
      } as JwtVerifierOptions)
    : createGoogleIdTokenVerifier(clientIds, options.verifier);
  const toActor = createUserActorMapper(host, {
    projectId: host.project.id,
    roles: [WEB_READER_ROLE],
    allow: emailAllowList(options.allowedEmails),
  });

  const port = options.port ?? 4200;
  const mcp = await createMcpServer({
    name: 'blueprint-server',
    host,
    engine,
    registerBuiltinPlugins: false,
    transport: { http: { port, host: options.host ?? '127.0.0.1', path: '/mcp', publicUrl: options.publicUrl } },
    logger: options.logger ?? console,
    auth: {
      authorizationServers: [options.verifier?.issuers?.[0] ?? GOOGLE_ISSUER],
      scopesSupported: ['openid', 'email'],
      async authenticate(token) {
        const verified = await verifier.verify(token);
        const actor = await toActor({
          issuer: verified.issuer,
          subject: verified.subject,
          email: verified.email,
          name: verified.claims.name,
        });
        if (!actor) {
          options.logger?.warn?.(`[blueprint-server] ${verified.email ?? verified.subject} is not on the allow list`);
          return null;
        }
        return { issuer: verified.issuer, subject: verified.subject, email: verified.email, actor };
      },
    },
  });
  await mcp.listen();

  const boundPort = mcp.address()?.port ?? port;
  return {
    host,
    mcp,
    url: `${(options.publicUrl ?? `http://${options.host ?? '127.0.0.1'}:${boundPort}`).replace(/\/+$/, '')}/mcp`,
    async close() {
      await mcp.close();
      await host.stop();
    },
  };
}
