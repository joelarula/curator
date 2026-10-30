import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAppConfig, loadEnvFiles, mergeConfig, parseProfiles, profilesFromArgv } from '../dist/index.js';

function tempDir(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator_appconfig_'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('parseProfiles / profilesFromArgv', () => {
  assert.deepEqual(parseProfiles(' dev, local ,dev'), ['dev', 'local']);
  assert.deepEqual(parseProfiles(undefined), []);
  assert.deepEqual(profilesFromArgv(['node', 'cli', 'serve', '--profile', 'dev,test']), ['dev', 'test']);
  assert.deepEqual(profilesFromArgv(['node', 'cli', '--profile=prod']), ['prod']);
  assert.equal(profilesFromArgv(['node', 'cli']), undefined);
});

test('mergeConfig merges objects deeply and replaces arrays and scalars', () => {
  const merged = mergeConfig({ a: { x: 1, y: [1, 2] }, b: 1 }, { a: { y: [3] }, b: 0 });
  assert.deepEqual(merged, { a: { x: 1, y: [3] }, b: 0 });
});

test('loadAppConfig without profiles reads only the base file', () => {
  const { dir, cleanup } = tempDir({
    'demo.config.yaml': 'table:\n  chips: 1000\n  seats: 4\n',
    'demo.config.dev.yaml': 'table:\n  chips: 50\n',
  });
  try {
    const cfg = loadAppConfig({ appId: 'demo', searchDirs: [dir], env: {} });
    assert.deepEqual(cfg.activeProfiles, []);
    assert.deepEqual(cfg.values, { table: { chips: 1000, seats: 4 } });
    assert.deepEqual(cfg.sources, [path.join(dir, 'demo.config.yaml')]);
  } finally {
    cleanup();
  }
});

test('loadAppConfig layers profile files in order, later profiles winning', () => {
  const { dir, cleanup } = tempDir({
    'demo.config.yaml': 'table:\n  chips: 1000\n  seats: 4\nhost:\n  profile: server\n',
    'demo.config.dev.yaml': 'table:\n  chips: 50\nhost:\n  profile: ephemeral\n',
    'demo.config.local.json': '{ "table": { "seats": 2 } }',
  });
  try {
    const cfg = loadAppConfig({ appId: 'demo', searchDirs: [dir], profiles: 'dev,local', env: {} });
    assert.deepEqual(cfg.activeProfiles, ['dev', 'local']);
    assert.deepEqual(cfg.values, { table: { chips: 50, seats: 2 } }, 'reserved keys are not part of values');
    assert.deepEqual(cfg.host, { profile: 'ephemeral' });
    assert.equal(cfg.sources.length, 3);
  } finally {
    cleanup();
  }
});

test('loadAppConfig picks profiles from <APPID>_PROFILES, CURATOR_PROFILES, then profiles.active', () => {
  const { dir, cleanup } = tempDir({
    'demo.config.yaml': 'profiles:\n  active: dev\nlevel: base\n',
    'demo.config.dev.yaml': 'level: dev\n',
    'demo.config.prod.yaml': 'level: prod\n',
  });
  try {
    assert.equal(loadAppConfig<any>({ appId: 'demo', searchDirs: [dir], env: {} }).values.level, 'dev');
    assert.equal(loadAppConfig<any>({ appId: 'demo', searchDirs: [dir], env: { CURATOR_PROFILES: 'prod' } }).values.level, 'prod');
    assert.equal(
      loadAppConfig<any>({ appId: 'demo', searchDirs: [dir], env: { DEMO_PROFILES: 'dev', CURATOR_PROFILES: 'prod' } }).values.level,
      'dev',
    );
  } finally {
    cleanup();
  }
});

test('loadAppConfig finds profile files next to an explicit config path', () => {
  const { dir, cleanup } = tempDir({
    'custom.yaml': 'level: base\n',
    'custom.test.yaml': 'level: test\n',
  });
  try {
    const cfg = loadAppConfig<any>({ appId: 'demo', configPath: path.join(dir, 'custom.yaml'), profiles: ['test'], env: {} });
    assert.equal(cfg.values.level, 'test');
    assert.throws(() => loadAppConfig({ appId: 'demo', configPath: path.join(dir, 'missing.yaml'), env: {} }), /Invalid config file/);
  } finally {
    cleanup();
  }
});

test('loadEnvFiles: existing env > .env.<profile> > .env, and profiles can come from .env', () => {
  const { dir, cleanup } = tempDir({
    '.env': 'DEMO_PROFILES=dev\nA=base\nB=base\nC=base\n',
    '.env.dev': 'B=dev\nC=dev\n',
  });
  try {
    const env: Record<string, string | undefined> = { C: 'process' };
    const result = loadEnvFiles({ appId: 'demo', dirs: [dir], env });
    assert.deepEqual(result.profiles, ['dev']);
    assert.equal(env.A, 'base');
    assert.equal(env.B, 'dev');
    assert.equal(env.C, 'process');
    assert.deepEqual(result.sources, [path.join(dir, '.env'), path.join(dir, '.env.dev')]);
  } finally {
    cleanup();
  }
});
