/**
 * Agent catalog: how clients present an agent (title, description, icon, starter prompts) and what its model can
 * do (capabilities), from an agent definition (plugin `agents`) or a stored agent's script AST.
 */
import type { CuratorAgentDefinition } from './CuratorContracts.js';
import { LlmFactory } from './llm/LlmFactory.js';
import { llmCapabilities, type ILlmProvider, type LlmCapabilities } from './llm/ILlmProvider.js';

/** Presentation of an agent in pickers (`CuratorAgentDefinition.presentation`). */
export interface CuratorAgentPresentation {
  title?: string;
  description?: string;
  /** Material Design icon name, e.g. `mdi-robot-happy-outline`. */
  icon?: string;
  /** Prompts offered as chips before the first message. */
  starterPrompts?: string[];
}

export interface AgentCapabilities extends LlmCapabilities {
  provider: string;
  model?: string;
  /** Provider or model is a `$` expression: resolved per call, so these are the default provider's. */
  dynamic: boolean;
}

export interface AgentCatalogEntry {
  name: string;
  title: string;
  description?: string;
  icon?: string;
  starterPrompts: string[];
  /** Of the agent's entry model (its first Curator_Agent node); null for workflows without a model step. */
  capabilities: AgentCapabilities | null;
}

const isExpr = (v: unknown) => typeof v === 'string' && v.trim().startsWith('$');

/** First `Curator_Agent` node in the AST, depth first (the step that talks first). */
export function entryAgentNode(ast: unknown): Record<string, any> | null {
  const seen = new Set<unknown>();
  const visit = (node: unknown): Record<string, any> | null => {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = visit(child);
        if (hit) return hit;
      }
      return null;
    }
    const obj = node as Record<string, any>;
    if (obj.type === 'Curator_Agent') return obj;
    for (const child of Object.values(obj)) {
      const hit = visit(child);
      if (hit) return hit;
    }
    return null;
  };
  return visit(typeof ast === 'string' ? safeJson(ast) : ast);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Capabilities of an agent node's model; tools are 'none' when the node offers no tools. */
export function agentNodeCapabilities(
  node: Record<string, any>,
  getProvider: (name?: string, baseUrl?: string) => ILlmProvider = (n, b) => LlmFactory.getProvider(n, b)
): AgentCapabilities {
  const dynamic = isExpr(node.provider) || isExpr(node.model) || isExpr(node.baseUrl);
  const provider = getProvider(isExpr(node.provider) ? undefined : node.provider, isExpr(node.baseUrl) ? undefined : node.baseUrl);
  const model = typeof node.model === 'string' && !isExpr(node.model) ? node.model : undefined;
  const caps = llmCapabilities(provider, model);
  const offersTools = Array.isArray(node.tools) ? node.tools.length > 0 : !!node.tools;
  return { ...caps, tools: offersTools ? caps.tools : 'none', provider: provider.providerName, model, dynamic };
}

/** Catalog entry for an agent definition (presentation falls back to the description and the name). */
export function describeAgent(
  name: string,
  def: (Partial<CuratorAgentDefinition> & { presentation?: CuratorAgentPresentation; ast?: unknown }) | undefined,
  getProvider?: (name?: string, baseUrl?: string) => ILlmProvider
): AgentCatalogEntry {
  const p: CuratorAgentPresentation = def?.presentation ?? {};
  const node = entryAgentNode(def?.ast);
  return {
    name,
    title: p.title || name,
    description: p.description ?? def?.description,
    icon: p.icon,
    starterPrompts: Array.isArray(p.starterPrompts) ? p.starterPrompts.filter((s) => typeof s === 'string' && s.trim()) : [],
    capabilities: node ? agentNodeCapabilities(node, getProvider) : null,
  };
}
