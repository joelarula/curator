import test from 'node:test';
import assert from 'node:assert/strict';
import { CuratorHostEvents } from '../dist/events/CuratorHostEvents.js';
import { createCuratorHost } from '../dist/createCuratorHost.js';
import { seedAgentsAndTools } from '../dist/seed/seedAgentsAndTools.js';

test('CuratorHostEvents emits typed and wildcard events', () => {
  const bus = new CuratorHostEvents();
  const received: any[] = [];
  const typedReceived: any[] = [];

  bus.onEvent((evt) => received.push(evt));
  bus.onType('request_start', (payload) => typedReceived.push(payload));

  bus.broadcast('request_start', { requestId: 101, agent: 'test_agent' });
  bus.broadcast('log', { message: 'hello world' });

  assert.equal(received.length, 2);
  assert.equal(received[0].type, 'request_start');
  assert.equal(received[0].payload.requestId, 101);

  assert.equal(typedReceived.length, 1);
  assert.equal(typedReceived[0].requestId, 101);

  const logs = bus.getRecentLogs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, 'hello world');

  bus.close();
});

test('createCuratorHost is exported as a function', () => {
  assert.equal(typeof createCuratorHost, 'function');
});

test('seedAgentsAndTools is exported as a function', () => {
  assert.equal(typeof seedAgentsAndTools, 'function');
});
