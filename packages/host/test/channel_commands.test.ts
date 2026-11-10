import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientShell } from '../dist/index.js';

test('CLI channels: /join, /post, /invite, /leave call the channel tools; addressed channel events are printed', async () => {
  const calls: Array<[string, any]> = [];
  const shell: any = createClientShell({
    channels: true,
    onToolCall: async (toolName: string, args: any) => {
      calls.push([toolName, args]);
      if (toolName === 'channel_list') return { channels: [{ conversationId: 12, title: 'General', memberCount: 2 }] };
      return { ok: true };
    },
  } as any);

  await shell.handleLine('/join gen');
  assert.deepEqual(calls.map((c) => c[0]), ['channel_list', 'channel_request']);
  assert.deepEqual(calls[1][1], { conversationId: 12, action: 'join' });
  assert.equal(shell.channelShell.active.conversationId, 12);

  await shell.handleLine('/post Hello there');
  assert.deepEqual(calls.at(-1), ['channel_post', { conversationId: 12, text: 'Hello there' }]);

  await shell.handleLine('/invite agent:helper');
  assert.deepEqual(calls.at(-1), ['channel_request', { conversationId: 12, action: 'invite', agentId: 'helper' }]);
  await shell.handleLine('/invite u-77 #12');
  assert.deepEqual(calls.at(-1), ['channel_request', { conversationId: 12, action: 'invite', userId: 'u-77' }]);

  const printed: string[] = [];
  shell.printAsync = (t: string) => printed.push(t);
  assert.equal(shell.channelShell.ingest('conversation:message_delivered', { conversationId: 12, text: 'hi', sender: { name: 'Ann' } }), true);
  assert.equal(shell.channelShell.ingest('conversation:invited', { conversationId: 30 }), true);
  assert.equal(shell.channelShell.ingest('table_update', {}), false);
  assert.match(printed[0], /\[General\].*Ann.*hi/);
  assert.match(printed[1], /invited to channel #30.*\/join 30/);

  await shell.handleLine('/leave');
  assert.deepEqual(calls.at(-1), ['channel_request', { conversationId: 12, action: 'leave' }]);
  assert.equal(shell.channelShell.active, null);
});
