import {
  createMcpServerFromHost,
  type CuratorMcpInstance,
  type McpTransport,
} from '@curator/mcp-server';
import type { GalleryHost } from '../host.ts';
import { GalleryRole } from '../models/index.ts';

export interface CreateGalleryMcpOptions {
  host: GalleryHost;
  transport?: McpTransport;
  allowAnonymousHttp?: boolean;
}

/**
 * Creates a Curator MCP server instance bound to the GalleryHost.
 * All gallery AST tools, storage tools, and image processing tools marked with
 * `mcp: { expose: true }` are automatically exposed and executed durably via `host`.
 */
export async function createGalleryMcpServer(
  options: CreateGalleryMcpOptions
): Promise<CuratorMcpInstance> {
  const { host, transport = 'stdio', allowAnonymousHttp = true } = options;

  const mcp = await createMcpServerFromHost(host, {
    name: 'curator-gallery-mcp-server',
    version: '1.0.0',
    transport,
    allowAnonymousHttp,
    registerBuiltinPlugins: true,
    session: {
      peerId: 'mcp-gallery-client',
      roles: [GalleryRole.ADMIN, GalleryRole.CURATOR, GalleryRole.VIEWER],
      trustTier: 'owner',
    } as any,
  });

  return mcp;
}
