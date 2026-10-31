import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEERIS_WORKFLOW_ASTS,
  buildPipelineScrapeAST,
  buildRescrapeMissingAST,
  buildSingleScrapeAST,
} from '../src/workflows/index.ts';
import { keerisPlugin, keerisScripts } from '../src/plugins/keerisPlugin.ts';
import { keerisManifest, keerisAppContract } from '../src/contracts/index.ts';
import { KeerisRole, KeerisTool, KeerisModule } from '../src/models/index.ts';

test('Keeris Deterministic: MiniApp Manifest & Contract', () => {
  assert.equal(keerisManifest.id, 'keeris');
  assert.ok(keerisManifest.requiredHostCapabilities?.includes('ast:v2'));
  assert.ok(keerisManifest.requiredHostCapabilities?.includes('channel:direct'));
  assert.ok(keerisManifest.requiredHostCapabilities?.includes('channel:repl'));

  assert.equal(keerisAppContract.manifest.id, 'keeris');
  assert.ok(Array.isArray(keerisAppContract.roles));
  assert.ok(keerisAppContract.roles.includes(KeerisRole.ADMIN));
  assert.ok(keerisAppContract.roles.includes(KeerisRole.CURATOR));
  assert.ok(keerisAppContract.roles.includes(KeerisRole.VIEWER));
});

test('Keeris Deterministic: Plugin Structure & RBAC Roles', () => {
  assert.equal(keerisPlugin.name, 'miniapp:keeris');
  assert.equal(keerisPlugin.version, '2.0.0');

  assert.ok(keerisPlugin.roles?.[KeerisRole.ADMIN]);
  assert.ok(keerisPlugin.roles?.[KeerisRole.CURATOR]);
  assert.ok(keerisPlugin.roles?.[KeerisRole.VIEWER]);

  // Curator has trigger and download tools
  const curatorTools = keerisPlugin.roles[KeerisRole.CURATOR].tools || [];
  assert.ok(curatorTools.includes(KeerisTool.TRIGGER_AGENT));
  assert.ok(curatorTools.includes(KeerisTool.DOWNLOAD_EPISODE));

  // Viewer has search and stats tools
  const viewerTools = keerisPlugin.roles[KeerisRole.VIEWER].tools || [];
  assert.ok(viewerTools.includes(KeerisTool.SEARCH_TRACKS));
  assert.ok(viewerTools.includes(KeerisTool.GET_STATS));
});

test('Keeris Deterministic: AST Workflows Compilation (AST v2)', () => {
  // 1. Pipeline Scrape AST
  const pipeline = buildPipelineScrapeAST({
    seriesContentId: '1037846',
    programTitle: 'Kauamängiv',
    limit: 25,
  });
  assert.equal(pipeline.type, 'Curator_Sequential');
  assert.equal(pipeline.subAgents.length, 2);

  const [discoveryStep, forEachStep] = pipeline.subAgents;
  assert.equal(discoveryStep.type, 'Curator_Tool');
  assert.equal((discoveryStep as any).toolName, KeerisTool.DISCOVER_EPISODES);
  assert.equal((discoveryStep as any).args.seriesContentId, '1037846');
  assert.equal((discoveryStep as any).args.limit, 25);

  assert.equal(forEachStep.type, 'Curator_ForEach');
  assert.equal((forEachStep as any).collectionExpression, '{{discovery.data}}');
  assert.equal((forEachStep as any).iteratorName, 'episode');
  assert.equal((forEachStep as any).body.type, 'Curator_Tool');
  assert.equal((forEachStep as any).body.toolName, KeerisTool.PROCESS_EPISODE);

  // 2. Rescrape Missing Episodes AST
  const rescrape = buildRescrapeMissingAST({ limit: 10 });
  assert.equal(rescrape.type, 'Curator_Sequential');
  assert.equal(rescrape.subAgents.length, 2);
  const [rescrapeDiscovery, rescrapeForEach] = rescrape.subAgents;
  assert.equal((rescrapeDiscovery as any).toolName, KeerisTool.DISCOVER_MISSING);
  assert.equal((rescrapeForEach as any).body.toolName, KeerisTool.PROCESS_EPISODE);
  assert.equal((rescrapeForEach as any).body.args.refresh, true);

  // 3. Single Scrape AST
  const single = buildSingleScrapeAST({ seriesContentId: '999', programTitle: 'Test' });
  assert.equal(single.type, 'Curator_Sequential');
  assert.equal(single.subAgents.length, 1);
  assert.equal((single.subAgents[0] as any).toolName, KeerisTool.SCRAPE_SERIES);

  // 4. Registry verification
  assert.ok(KEERIS_WORKFLOW_ASTS[KeerisModule.PIPELINE_SCRAPE]);
  assert.ok(KEERIS_WORKFLOW_ASTS[KeerisModule.PIPELINE_RESCRAPE]);
  assert.ok(KEERIS_WORKFLOW_ASTS[KeerisModule.SINGLE_SCRAPE]);

  assert.ok(keerisScripts[KeerisModule.PIPELINE_SCRAPE]);
  assert.ok(keerisScripts[KeerisModule.PIPELINE_RESCRAPE]);
  assert.ok(keerisScripts[KeerisModule.SINGLE_SCRAPE]);
});

test('Keeris Deterministic: Dual Database Mode (MariaDB & SQLite support)', async () => {
  const { openDatabase } = await import('../src/db.ts');
  assert.equal(typeof openDatabase, 'function');

  // 1. MariaDB adapter detection
  const mysqlUrl = 'mysql://curator:secret@127.0.0.1:3306/keeris_test';
  const mariaAdapter = openDatabase(mysqlUrl);
  assert.equal(mariaAdapter.isMysql, true);
  assert.equal(mariaAdapter.isPostgres, false);
  try {
    await mariaAdapter.close();
  } catch (_) {}

  // 2. SQLite adapter detection
  const sqliteAdapter = openDatabase(':memory:');
  assert.equal(sqliteAdapter.isMysql, false);
  assert.equal(sqliteAdapter.isPostgres, false);
  try {
    if (typeof sqliteAdapter.close === 'function') sqliteAdapter.close();
  } catch (_) {}
});

test('Keeris Deterministic: Host Profiles & Layered Config Properties', async () => {
  const { loadAppConfig } = await import('@curator/host/config');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const keerisRoot = path.resolve(currentDir, '..');

  // 1. Test loading base config
  const baseApp = loadAppConfig({
    appId: 'keeris',
    searchDirs: [keerisRoot],
  });
  assert.equal(baseApp.appId, 'keeris');
  assert.ok(baseApp.values.database);
  assert.ok(baseApp.values.crawler);
  assert.equal(baseApp.host.intervalMs, 3000);

  // 2. Test layering local profile properties
  const localApp = loadAppConfig({
    appId: 'keeris',
    profiles: 'local',
    searchDirs: [keerisRoot],
  });
  assert.ok(localApp.activeProfiles.includes('local'));
  assert.equal(localApp.values.database.url, 'data/keeris.db');
  assert.equal(localApp.values.database.curatorUrl, '');
  assert.equal(localApp.host.intervalMs, 1000);
  assert.equal(localApp.host.profile, 'embedded');
});

