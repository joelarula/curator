import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createDirectSessionChannel,
  createKeerisClientShell,
  KEERIS_WHITELISTED_TOOLS,
  KEERIS_COMMANDS,
} from '../src/client/keerisClient.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDbPath = path.resolve(__dirname, '../data/test_keeris_direct.db');

test('Keeris ClientShell: Whitelist & Declarative Commands', () => {
  const shell = createKeerisClientShell({ actorName: 'TestCurator' });
  assert.ok(shell);

  const toolNames = KEERIS_WHITELISTED_TOOLS.map((t) => (typeof t === 'string' ? t : t.name));
  assert.ok(toolNames.includes('keeris_search_tracks'));
  assert.ok(toolNames.includes('keeris_get_stats'));
  assert.ok(toolNames.includes('keeris_get_agents'));
  assert.ok(toolNames.includes('keeris_trigger_agent'));
  assert.ok(toolNames.includes('vikerraadio_download_episode'));

  const commandNames = KEERIS_COMMANDS.map((c) => c.name);
  assert.ok(commandNames.includes('search'));
  assert.ok(commandNames.includes('stats'));
  assert.ok(commandNames.includes('agents'));
  assert.ok(commandNames.includes('trigger'));
  assert.ok(commandNames.includes('download'));
  assert.ok(commandNames.includes('status'));
});

test('Keeris Direct Session Channel: In-Process Host & Lifecycle', async () => {
  const channel = await createDirectSessionChannel({
    databasePath: testDbPath,
    drive: 'step',
    quiet: true,
  });

  try {
    assert.ok(channel);
    assert.ok(channel.host);
    assert.equal(typeof channel.runTool, 'function');
    assert.equal(typeof channel.send, 'function');
    assert.equal(typeof channel.on, 'function');

    // Run whitelisted tool in-process via direct host
    const statsResult = await channel.runTool!('keeris_get_stats', {});
    assert.ok(statsResult !== undefined);
  } finally {
    await channel.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch (_) {}
  }
});
