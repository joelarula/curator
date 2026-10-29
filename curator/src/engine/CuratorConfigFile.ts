import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { CuratorConfig } from './CuratorContracts.js';

/** Extensions `findConfigFile` tries, in order. */
export const CONFIG_FILE_EXTENSIONS = ['.yaml', '.yml', '.json'];

/**
 * Reads a configuration file: `.json` as JSON, anything else as YAML (a superset of JSON).
 * The top level must be a mapping; a missing, unreadable or malformed file throws with its path.
 */
export function loadConfigFile(file: string): CuratorConfig {
  let parsed: unknown;
  try {
    const text = fs.readFileSync(file, 'utf8');
    parsed = path.extname(file).toLowerCase() === '.json' ? JSON.parse(text) : YAML.parse(text);
  } catch (e: any) {
    throw new Error(`Invalid config file ${file}: ${e?.message || e}`);
  }
  if (parsed == null) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config file ${file}: the top level must be a mapping`);
  }
  return parsed as CuratorConfig;
}

/**
 * First existing `<dir>/<baseName><ext>` over `dirs` × `CONFIG_FILE_EXTENSIONS`
 * (e.g. `findConfigFile('poker.config', [process.cwd()])` finds `poker.config.yaml` before `.json`).
 */
export function findConfigFile(baseName: string, dirs: string[]): string | undefined {
  for (const dir of dirs) {
    for (const ext of CONFIG_FILE_EXTENSIONS) {
      const candidate = path.resolve(dir, `${baseName}${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}
