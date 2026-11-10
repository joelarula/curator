import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { useConversations } from '../src/composables/useConversations.ts';

const tools = (names: string[]) => ref(names.map((name) => ({ name })));

test('conversations: offered only with conversation_list; actions run their tool and reload', async () => {
  assert.equal(useConversations(tools([]), async () => ({})).available.value, false);

  const calls: any[] = [];
  const run = async (name: string, args: any) => {
    calls.push([name, args]);
    if (name === 'conversation_list') return { conversations: [{ conversationId: 1, externalId: 'c1', title: 'A', titled: true, pinned: false, archived: !!args.archived }] };
    return { ok: true };
  };
  const c = useConversations(tools(['conversation_list', 'conversation_pin', 'conversation_archive']), run);
  await c.load();
  assert.equal(c.conversations.value.length, 1);
  assert.equal(c.can('pin'), true);
  assert.equal(c.can('delete'), false);

  await c.setPinned(1, true);
  assert.deepEqual(calls.slice(-2), [['conversation_pin', { conversationId: 1, pinned: true }], ['conversation_list', { archived: false }]]);

  c.query.value = ' plan ';
  await c.toggleArchived();
  assert.deepEqual(calls.at(-1), ['conversation_list', { archived: true, query: 'plan' }]);
});

test('conversations: a failing action is reported and nothing is reloaded', async () => {
  const c = useConversations(tools(['conversation_list', 'conversation_delete']), async (name) => {
    if (name === 'conversation_delete') throw new Error('You cannot delete the conversation you are in');
    return { conversations: [] };
  });
  assert.equal(await c.remove(3), false);
  assert.match(String(c.error.value), /you are in/);
});

test('channels: open channels are listed; join / leave send a request and reload both lists', async () => {
  const calls: any[] = [];
  let joined = false;
  const run = async (name: string, args: any) => {
    calls.push([name, args]);
    if (name === 'channel_list') return { channels: [{ conversationId: 7, externalId: 'c7', title: 'General', memberCount: joined ? 1 : 0, joined, owned: false }] };
    if (name === 'channel_request') { joined = args.action === 'join'; return { requested: args.action }; }
    if (name === 'conversation_list') return { conversations: joined ? [{ conversationId: 7, externalId: 'c7', title: 'General', titled: true, pinned: false, archived: false, owned: false, memberCount: 1 }] : [] };
    return {};
  };
  const c = useConversations(tools(['conversation_list', 'channel_list', 'channel_request']), run);
  assert.equal(c.channelsAvailable.value, true);
  await c.loadChannels();
  assert.equal(c.channels.value[0].joined, false);

  assert.equal(await c.request(7, 'join', 0), true);
  assert.deepEqual(calls.find((x) => x[0] === 'channel_request'), ['channel_request', { conversationId: 7, action: 'join' }]);
  assert.equal(c.channels.value[0].joined, true);
  assert.equal(c.conversations.value[0].owned, false);

  await c.request(7, 'leave', 0);
  assert.deepEqual(c.conversations.value, []);
});

test('channel stream: opens with the latest messages, polls after the last id, posts and refreshes', async () => {
  const { useChannelStream } = await import('../src/composables/useChannelStream.ts');
  const calls: any[] = [];
  let stored = [{ id: 1, text: 'hi', sender: { type: 'user', id: 'u1', name: 'Ann' }, at: '2026-01-01T00:00:00Z' }];
  const run = async (name: string, args: any) => {
    calls.push([name, args]);
    if (name === 'channel_messages') return { messages: stored.filter((m) => args.afterId === undefined || m.id > args.afterId) };
    if (name === 'channel_post') { stored = [...stored, { id: stored.length + 1, text: args.text, sender: { type: 'user', id: 'u2', name: 'Bo' }, at: '' }]; return { posted: true }; }
    return {};
  };
  const s = useChannelStream(tools(['channel_messages', 'channel_post']), run, { pollMs: 0 });
  assert.equal(s.available.value, true);
  await s.open(7, 'General');
  assert.deepEqual(s.messages.value.map((m) => m.text), ['hi']);
  assert.deepEqual(calls[0], ['channel_messages', { conversationId: 7 }]);

  assert.equal(await s.post('  hello  '), true);
  assert.deepEqual(calls.find((c) => c[0] === 'channel_post'), ['channel_post', { conversationId: 7, text: 'hello' }]);
  assert.deepEqual(calls.at(-1), ['channel_messages', { conversationId: 7, afterId: 1 }]);
  assert.deepEqual(s.messages.value.map((m) => m.text), ['hi', 'hello']);

  s.close();
  assert.equal(s.conversationId.value, null);
});

test('channel stream: live deliveries for the open channel are added once (matched to stored messages by id)', async () => {
  const { useChannelStream } = await import('../src/composables/useChannelStream.ts');
  let emit: (type: string, payload: any) => void = () => {};
  const subscribe = (cb: any) => { emit = cb; return () => {}; };
  const stored = [{ id: 1, text: 'hi', sender: null, at: '' }];
  const s = useChannelStream(tools(['channel_messages', 'channel_post']), async (_n: string, args: any) => ({ messages: stored.filter((m) => args.afterId === undefined || m.id > args.afterId) }), { subscribe });
  await s.open(7, 'General');
  emit('conversation:message_delivered', { conversationId: 7, id: 2, text: 'live', sender: { type: 'user', id: 'u2' } });
  emit('conversation:message_delivered', { conversationId: 9, id: 3, text: 'other channel' });
  emit('conversation:message_delivered', { conversationId: 7, id: 2, text: 'live' });
  assert.deepEqual(s.messages.value.map((m) => [m.id, m.text]), [[1, 'hi'], [2, 'live']]);
  await s.refresh();
  assert.deepEqual(s.messages.value.map((m) => m.id), [1, 2]);

  // A reconnect fetches what was missed (no timer with a live feed)
  stored.push({ id: 5, text: 'missed while offline', sender: null, at: '' });
  emit('connected', {});
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(s.messages.value.map((m) => m.id), [1, 2, 5]);
});
