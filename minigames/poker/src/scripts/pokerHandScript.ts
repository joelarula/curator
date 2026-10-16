import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCoffeeScriptToAST, type CuratorAstNode } from '../curator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the path to any standalone .coffee file across dev, tsx, and build paths.
 */
export function resolveCoffeeScriptPath(filename: string): string {
  const candidates = [
    path.join(__dirname, filename),
    path.join(__dirname, '..', 'scripts', filename),
    path.join(__dirname, '..', '..', 'src', 'scripts', filename),
    path.join(process.cwd(), 'src', 'scripts', filename),
    path.join(process.cwd(), 'minigames', 'poker', 'src', 'scripts', filename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `CoffeeScript file ${filename} not found. Looked in candidate paths: ${candidates.join(', ')}`
  );
}

/**
 * Loads the raw CoffeeScript string from its standalone .coffee file.
 */
export function loadCoffeeScript(filename: string): string {
  const filePath = resolveCoffeeScriptPath(filename);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Compiles any standalone .coffee file into a formal Curator Execution AST node with optional compile-time context.
 */
export async function compileCoffeeScriptFile(
  filename: string,
  initialContext: Record<string, any> = {}
): Promise<CuratorAstNode> {
  const code = loadCoffeeScript(filename);
  return compileCoffeeScriptToAST(code, initialContext);
}

// Backward-compatible poker_workflow helpers
export function getPokerWorkflowCoffeePath(): string {
  return resolveCoffeeScriptPath('poker_workflow.coffee');
}

export function loadPokerWorkflowCoffeeScript(): string {
  return loadCoffeeScript('poker_workflow.coffee');
}

export function loadAgentPromptCoffeeScript(): string {
  return loadCoffeeScript('agent_prompt.coffee');
}

export function loadPokerRulesCoffeeScript(): string {
  return loadCoffeeScript('poker_rules.coffee');
}

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

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
  const compiler = getCoffeeCompiler();
  return compiler.compile(code, options);
}

export function evaluateCoffeeScriptSync<T = any>(code: string): T {
  const js = compileCoffeeScriptSync(code);
  const mod = { exports: {} as any };
  const fn = new Function('module', 'exports', js);
  fn(mod, mod.exports);
  return (mod.exports?.default || mod.exports) as T;
}

let cachedPromptBuilder: any = null;

export function formatAgentPromptCoffeeScript(params: any): any {
  if (!cachedPromptBuilder) {
    const coffeeCode = loadAgentPromptCoffeeScript();
    cachedPromptBuilder = evaluateCoffeeScriptSync(coffeeCode);
  }
  const rules = getPokerRules();
  const rulesDescription = rules?.getRulesDescription ? rules.getRulesDescription() : undefined;
  const enriched = typeof params === 'object' && params !== null ? { rulesDescription, ...params } : params;
  return cachedPromptBuilder(enriched);
}

export const POKER_WORKFLOW_COFFEESCRIPT = loadPokerWorkflowCoffeeScript();

/**
 * AST Compilers for each modular CoffeeScript workflow with optional context
 */
export async function getPokerWorkflowAST(context?: Record<string, any>): Promise<CuratorAstNode> {
  return compileCoffeeScriptFile('poker_workflow.coffee', context);
}

export async function getPokerLobbyAST(context?: Record<string, any>): Promise<CuratorAstNode> {
  return compileCoffeeScriptFile('poker_lobby.coffee', context);
}

export async function getHumanTurnAST(context?: Record<string, any>): Promise<CuratorAstNode> {
  return compileCoffeeScriptFile('human_turn.coffee', context);
}

export async function getAgentTurnAST(context?: Record<string, any>): Promise<CuratorAstNode> {
  return compileCoffeeScriptFile('agent_turn.coffee', context);
}

export const getAiAgentTurnAST = getAgentTurnAST;

export async function getPokerActionAST(context?: Record<string, any>): Promise<CuratorAstNode> {
  return compileCoffeeScriptFile('poker_action.coffee', context);
}

let cachedPokerRules: any = null;

export function getPokerRules(): any {
  if (!cachedPokerRules) {
    const coffeeCode = loadPokerRulesCoffeeScript();
    cachedPokerRules = evaluateCoffeeScriptSync(coffeeCode);
  }
  return cachedPokerRules;
}

export async function getPokerRulesAST(context?: Record<string, any>): Promise<CuratorAstNode> {
  return compileCoffeeScriptFile('poker_rules.coffee', context);
}

export async function getAmbientReactionAST(context?: Record<string, any>): Promise<CuratorAstNode> {
  return compileCoffeeScriptFile('ambient_reaction.coffee', context);
}
