# @curator/federation

Peer-to-Peer (P2P) Federation, MCP Tool Proxying, and Distributed Event Mesh for Curator Hosts.

---

## Features

- **MCP Tool Federation**: Dynamically connects to remote peer MCP endpoints, generating local `CuratorTool` proxies namespaced as `<peer>:<toolName>` (e.g. `keeris:search_episodes`).
- **Distributed Event Mesh**: Bridges local `host.events` across WebSocket channels with deduplication and hop limit safety.
- **Federation Plugin**: Provides runtime mesh management tools (`mesh_list_peers`, `mesh_invoke_remote`, `mesh_broadcast_event`, `mesh_add_peer`).
- **Zero Monolithic Dependencies**: Hosts maintain complete process and database autonomy.

---

## Usage

```typescript
import { createCuratorHost } from '@curator/host';
import { withFederation } from '@curator/federation';

const host = await createCuratorHost({
  name: 'my-host',
  curatorDb: { path: './data/curator.db' },
  registerPlugins: async () => { /* ... */ }
});

// Attach Federation Layer
const mesh = await withFederation(host, {
  peerId: 'host-a',
  meshPort: 4001,
  peers: [
    {
      id: 'host-b',
      name: 'facilitator',
      mcpUrl: 'http://localhost:3002/mcp',
      eventsUrl: 'ws://localhost:4002/api/mesh/events',
    },
  ],
});

await host.start();

// Broadcast a distributed event across the mesh
mesh.broadcastEvent('task:assigned', { agent: 'reviewer', file: 'index.ts' });

// Remote tools are automatically registered in host.engine:
// host.engine.tools.get('facilitator:jira_pickup')
```
