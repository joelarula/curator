import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteMcpProxyTool } from '../dist/mcp/RemoteMcpProxyTool.js';

test('createRemoteMcpProxyTool namespaces and dispatches tool execution', async () => {
  let invoked = false;
  let passedArgs: any = null;

  const proxyTool = createRemoteMcpProxyTool({
    peer: { id: 'peer-alpha', name: 'alpha' },
    remoteName: 'calculate_metric',
    description: 'Remote metric calculator',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number' },
      },
    },
    callRemote: async (peerId: string, toolName: string, args: Record<string, unknown>) => {
      invoked = true;
      passedArgs = args;
      return { result: (args.value as number) * 10, fromPeer: peerId };
    },
  });

  assert.equal(proxyTool.name, 'alpha:calculate_metric');
  assert.ok(proxyTool.description.includes('peer "alpha"'));

  // Test execution
  const out: any = await proxyTool.runAsync({
    args: { value: 7 },
    toolContext: {},
  });

  assert.equal(invoked, true);
  assert.equal(passedArgs.value, 7);
  assert.equal(out.result, 70);
  assert.equal(out.fromPeer, 'peer-alpha');

  // Verify MCP declaration does not re-expose by default
  const decl = proxyTool.toMcpDeclaration();
  assert.equal(proxyTool.mcp?.expose, false);
});
