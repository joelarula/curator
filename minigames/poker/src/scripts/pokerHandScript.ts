import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { compileCoffeeScriptToAST, type CuratorAstNode } from '../curator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// In-memory caches for file paths, file contents, compiled ASTs, and evaluated modules
const filePathCache = new Map<string, string>();
const fileContentCache = new Map<string, string>();
const staticAstCache = new Map<string, CuratorAstNode>();
const evaluatedModuleCache = new Map<string, any>();

export const SCRIPTS_DIR = __dirname;

export interface ScriptHeaderMeta {
  id: string;
  name?: string;
  description?: string;
  [key: string]: any;
}

/**
 * Derives a script ID from its filename (e.g. "poker_workflow.coffee" -> "poker_workflow").
 */
export function filenameToId(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

/**
 * Normalizes a script ID to a .coffee filename (e.g. "poker_workflow" -> "poker_workflow.coffee").
 */
export function idToFilename(id: string): string {
  return id.endsWith('.coffee') ? id : `${id}.coffee`;
}

function parseKeyValues(block: string, target: Record<string, any>): void {
  const lines = block.split('\n');
  for (const line of lines) {
    const trimmed = line.trim().replace(/^#+\s*/, '');
    if (!trimmed || trimmed === '---') continue;
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      target[key] = val;
    }
  }
}

/**
 * Extracts script ID and metadata from frontmatter or comment header,
 * falling back to filenameToId(filename).
 */
export function parseScriptHeader(content: string, filename?: string): { meta: ScriptHeaderMeta; code: string } {
  const fallbackId = filename ? filenameToId(filename) : '';
  const meta: ScriptHeaderMeta = { id: fallbackId };
  let code = content;

  // 1. Standard YAML frontmatter: ^---\r?\n([\s\S]*?)\r?\n---\r?\n?
  const yamlMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (yamlMatch) {
    code = content.slice(yamlMatch[0].length);
    parseKeyValues(yamlMatch[1], meta);
  } else {
    // 2. CoffeeScript comment frontmatter: ^#\s*---\r?\n([\s\S]*?)\r?\n#\s*---\r?\n?
    const commentYamlMatch = content.match(/^#\s*---\r?\n([\s\S]*?)\r?\n#\s*---\r?\n?/);
    if (commentYamlMatch) {
      parseKeyValues(commentYamlMatch[1], meta);
    } else {
      // 3. CoffeeScript block comment: ^###\r?\n([\s\S]*?)\r?\n###\r?\n?
      const blockMatch = content.match(/^###\r?\n([\s\S]*?)\r?\n###\r?\n?/);
      if (blockMatch) {
        parseKeyValues(blockMatch[1], meta);
      } else {
        // 4. Scan leading comments for key-values (e.g. # id: ... or # description: ...)
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('#')) break;
          const stripped = trimmed.replace(/^#+\s*/, '').trim();
          const match = stripped.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
          if (match) {
            const key = match[1].trim();
            const val = match[2].trim().replace(/^["']|["']$/g, '');
            meta[key] = val;
          }
        }
      }
    }
  }

  if (!meta.id && fallbackId) {
    meta.id = fallbackId;
  }

  return { meta, code };
}

/**
 * Resolves the path to any .coffee file exclusively from the poker minigame scripts folder.
 */
export function resolveCoffeeScriptPath(filename: string): string {
  const normalized = idToFilename(filename);
  const cached = filePathCache.get(normalized);
  if (cached) return cached;

  const targetPath = path.join(SCRIPTS_DIR, normalized);
  if (fs.existsSync(targetPath)) {
    filePathCache.set(normalized, targetPath);
    return targetPath;
  }

  throw new Error(`CoffeeScript file "${filename}" not found in poker scripts folder (${SCRIPTS_DIR})`);
}

/**
 * Loads the raw CoffeeScript string from its standalone .coffee file (cached in memory).
 */
export function loadCoffeeScript(filename: string): string {
  const cached = fileContentCache.get(filename);
  if (cached !== undefined) return cached;

  const filePath = resolveCoffeeScriptPath(filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  fileContentCache.set(filename, content);
  return content;
}

/**
 * Compiles any standalone .coffee file into a formal Curator Execution AST node.
 * Automatically parses/strips frontmatter headers and caches AST output when called without dynamic context.
 */
export async function compileCoffeeScriptFile(
  filename: string,
  initialContext: Record<string, any> = {}
): Promise<CuratorAstNode> {
  const hasContext = initialContext && Object.keys(initialContext).length > 0;
  if (!hasContext) {
    const cached = staticAstCache.get(filename);
    if (cached) return structuredClone(cached);
  }

  const raw = loadCoffeeScript(filename);
  const { code } = parseScriptHeader(raw, filename);
  const ast = await compileCoffeeScriptToAST(code, initialContext);

  if (!hasContext) {
    staticAstCache.set(filename, ast);
    return structuredClone(ast);
  }
  return ast;
}

let cachedCoffee: any = null;
export function getCoffeeCompiler(): any {
  if (cachedCoffee) return cachedCoffee;
  try {
    cachedCoffee = require('coffeescript');
    return cachedCoffee;
  } catch {
    const candidates = [
      path.join(process.cwd(), 'curator', 'node_modules', 'coffeescript'),
      path.join(process.cwd(), '..', '..', 'curator', 'node_modules', 'coffeescript'),
      path.join(process.cwd(), '..', 'curator', 'node_modules', 'coffeescript'),
      path.resolve(__dirname, '..', '..', '..', '..', 'curator', 'node_modules', 'coffeescript'),
      path.resolve(__dirname, '..', '..', '..', 'curator', 'node_modules', 'coffeescript'),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        cachedCoffee = require(cand);
        return cachedCoffee;
      }
    }
    throw new Error('CoffeeScript compiler could not be resolved from candidates: ' + candidates.join(', '));
  }
}

export function compileCoffeeScriptSync(code: string, options: any = { bare: true, header: false }): string {
  return getCoffeeCompiler().compile(code, options);
}

export function evaluateCoffeeScriptSync<T = any>(code: string): T {
  const js = compileCoffeeScriptSync(code);
  const mod = { exports: {} as any };
  const fn = new Function('module', 'exports', js);
  fn(mod, mod.exports);
  return (mod.exports?.default || mod.exports) as T;
}

/**
 * Evaluates a standalone CoffeeScript file and caches its exported result.
 * Automatically parses/strips frontmatter headers.
 */
export function evaluateCoffeeScriptFile<T = any>(filename: string): T {
  const cached = evaluatedModuleCache.get(filename);
  if (cached !== undefined) return cached;
  const raw = loadCoffeeScript(filename);
  const { code } = parseScriptHeader(raw, filename);
  const result = evaluateCoffeeScriptSync<T>(code);
  evaluatedModuleCache.set(filename, result);
  return result;
}

export function getPokerRules(): any {
  return evaluateCoffeeScriptFile('poker_rules.coffee');
}

export function formatAgentPromptCoffeeScript(params: any): any {
  const promptBuilder = evaluateCoffeeScriptFile<Function>('agent_prompt.coffee');
  const rules = getPokerRules();
  const rulesDescription = rules?.getRulesDescription ? rules.getRulesDescription() : undefined;
  const enriched = typeof params === 'object' && params !== null ? { rulesDescription, ...params } : params;
  return promptBuilder(enriched);
}

// ----------------------------------------------------------------------------
// Unified CoffeeScript Script Registry & Backward-Compatible Getters
// ----------------------------------------------------------------------------

export type PokerScriptId =
  | 'poker_workflow'
  | 'poker_lobby'
  | 'human_turn'
  | 'agent_turn'
  | 'poker_action'
  | 'ambient_reaction'
  | 'poker_rules'
  | 'agent_prompt'
  | string;

export function getPokerScriptSource(scriptId: string): string {
  return loadCoffeeScript(idToFilename(scriptId));
}

export async function getPokerScriptAST(
  scriptId: string,
  context?: Record<string, any>
): Promise<CuratorAstNode> {
  return compileCoffeeScriptFile(idToFilename(scriptId), context);
}

export function getPokerScriptMetadata(scriptId: string): ScriptHeaderMeta {
  const filePath = resolveCoffeeScriptPath(scriptId);
  const content = loadCoffeeScript(filePath);
  return parseScriptHeader(content, filePath).meta;
}

/**
 * Loads raw CoffeeScript file contents for all .coffee files in scripts/.
 * Plugin registration in Curator Core parses headers/metadata and handles script registration.
 */
export function loadPokerScriptSources(): Record<string, string> {
  const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.coffee'));
  const sources: Record<string, string> = {};

  for (const file of files) {
    sources[filenameToId(file)] = loadCoffeeScript(file);
  }

  return sources;
}


