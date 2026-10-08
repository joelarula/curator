import test from 'node:test';
import assert from 'node:assert/strict';
import { CuratorHostEvents } from '../dist/events/CuratorHostEvents.js';

test('CuratorHostEvents broadcast and event handlers', () => {
  const bus = new CuratorHostEvents({ maxLogs: 50 });
  const allEvents: any[] = [];
  const startEvents: any[] = [];

  const unsubAll = bus.onEvent((evt) => allEvents.push(evt));
  const unsubStart = bus.onType('request_start', (payload, evt) => {
    startEvents.push({ payload, evt });
  });

  bus.broadcast('request_start', { requestId: 42, agent: 'jira_sync' });
  bus.broadcast('log', { message: 'syncing...' });
  bus.broadcast('request_done', { requestId: 42, success: true });

  assert.equal(allEvents.length, 3);
  assert.equal(startEvents.length, 1);
  assert.equal(startEvents[0].payload.requestId, 42);
  assert.equal(startEvents[0].payload.agent, 'jira_sync');

  const logs = bus.getRecentLogs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, 'syncing...');

  unsubStart();
  unsubAll();
  bus.close();
});
