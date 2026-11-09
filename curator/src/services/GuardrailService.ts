import AjvModule from 'ajv';
import { SecretService, passesLuhnCheck, type RedactionRule } from './SecretService.js';
import {
  escapeHtml,
  stripUnsafeHtml,
  escapeShellArg,
  escapeSqlLiteral,
  escapeSqlIdentifier,
} from '../engine/output/OutputFormats.js';
import { logger } from '../utils/logger.js';
import type { LlmRequest, LlmResponse } from '../engine/llm/ILlmProvider.js';

const Ajv = (AjvModule as any).default || AjvModule;
const sharedAjv = new Ajv({ allErrors: true, strict: false });

function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
}

/**
 * MITRE ATLAS technique tags for security telemetry and guardrail events.
 */
export const MitreAtlasTag = {
  PROMPT_INJECTION: 'AML.T0051',
  INDIRECT_PROMPT_INJECTION: 'AML.T0051.001',
  UNSAFE_OUTPUT: 'AML.T0054',
  ANOMALOUS_TOOL_INVOCATION: 'AML.T0040',
  DATA_LEAKAGE: 'AML.T0024',
} as const;

export type MitreAtlasTag = (typeof MitreAtlasTag)[keyof typeof MitreAtlasTag];

/**
 * Pluggable ingress signature rule (regex or predicate) for prompt-injection and content filtering.
 */
export interface IngressSignatureRule {
  pattern: RegExp | ((prompt: string) => boolean);
  atlasTag?: MitreAtlasTag;
  reason?: string;
  enabled?: boolean | (() => boolean);
}

/**
 * Built-in prompt-injection and delimiter-spoofing signatures; plugins may add, override, or disable by name.
 */
export const BUILTIN_INGRESS_SIGNATURES: Record<string, IngressSignatureRule> = {
  delimiter_spoofing_chatml: {
    pattern: /<\|(?:im_start|im_end|system|endoftext|eot_id|start_header_id|end_header_id)\|>/i,
    atlasTag: MitreAtlasTag.PROMPT_INJECTION,
  },
  delimiter_spoofing_llama_inst: {
    pattern: /(?:<<SYS>>|<\/SYS>>|\[INST\]|\[\/INST\])/,
    atlasTag: MitreAtlasTag.PROMPT_INJECTION,
  },
  instruction_override_directive: {
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|prompts|rules|directives)\b/i,
    atlasTag: MitreAtlasTag.PROMPT_INJECTION,
  },
  system_role_hijack: {
    pattern: /(?:^|\n)\s*(?:SYSTEM\s*OVERRIDE|NEW\s+SYSTEM\s+PROMPT|ADMIN\s+OVERRIDE)\s*:/i,
    atlasTag: MitreAtlasTag.PROMPT_INJECTION,
  },
};

/**
 * Built-in tool name patterns (`*` wildcards supported) stripped from LLM agent tool-calling (AML.T0040).
 */
export const BUILTIN_BLOCKED_AGENT_TOOLS: readonly string[] = [
  'eval',
  'exec',
  'shell',
  'bash',
  'sh',
  'zsh',
  'powershell',
  'pwsh',
  'cmd',
  'raw_sql',
  'execute_sql',
  'vm_exec',
  'system_exec',
  'run_command',
  'child_process',
];

/**
 * Built-in cloud metadata / link-local hosts blocked for LLM & vector endpoint egress (SSRF protection).
 */
export const BUILTIN_BLOCKED_ENDPOINT_HOSTS: readonly string[] = [
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.azure.internal',
  '100.100.100.200',
];

export interface IngressGuardrailConfig {
  /** Maximum characters permitted in a single prompt before truncation/rejection (default: 100,000). */
  maxPromptChars?: number;
  /** Truncate instead of rejecting when input exceeds maxPromptChars (default: true). */
  truncateOnOverflow?: boolean;
  /** Reject prompts matching registered prompt-injection signatures (default: true). */
  blockPromptInjection?: boolean;
  /** Per-call regex patterns that must NOT match the prompt. */
  blockPatterns?: (RegExp | string)[];
  /** Per-call regex pattern that the prompt MUST match. */
  allowPattern?: RegExp | string;
}

export interface IngressValidationResult {
  allowed: boolean;
  sanitizedPrompt: string;
  truncated: boolean;
  reason?: string;
  atlasTag?: MitreAtlasTag;
  matchedRule?: string;
}

export interface EgressSanitizationConfig {
  redactPci?: boolean;
  redactSsn?: boolean;
  redactEmails?: boolean;
  redactPhones?: boolean;
  stripXssVectors?: boolean;
}

/**
 * External guardrail evaluation provider (e.g., Llama Guard, NeMo Guardrails, Promptfoo, Presidio).
 */
export interface IGuardrailProvider {
  readonly name: string;
  /** Order among providers: lower runs first (default 100). Built-in checks always run before (ingress) / after (egress). */
  readonly priority?: number;
  /** Agent names or `*` globs this provider applies to (default: every agent). */
  readonly appliesTo?: readonly string[];
  evaluateIngress?(prompt: string, context?: Record<string, unknown>): Promise<{ allowed: boolean; reason?: string; atlasTag?: MitreAtlasTag }>;
  /** Rewrites an agent's final output before it is stored (runs before the built-in secret/PII masking). */
  sanitizeEgress?(output: string, context?: Record<string, unknown>): Promise<string>;
  /**
   * Sees each model request of an agent turn after the built-in ingress checks: return a changed request, nothing to
   * keep it, or `{ blocked: true, reason }`. It cannot add tools or change the model/endpoint (those are restored).
   */
  inlet?(request: LlmRequest, context: GuardrailHookContext): Promise<GuardrailHookOutcome<LlmRequest>> | GuardrailHookOutcome<LlmRequest>;
  /** Sees each model response: return a changed response, nothing, or a block. It cannot add tool calls. */
  outlet?(response: LlmResponse, context: GuardrailHookContext): Promise<GuardrailHookOutcome<LlmResponse>> | GuardrailHookOutcome<LlmResponse>;
}

/** What an inlet/outlet hook knows about the call. */
export interface GuardrailHookContext {
  requestId: number;
  conversationId: number;
  agentName?: string;
  projectId?: string | null;
  /** Model turn within the agent step (1-based). */
  turn: number;
}

export interface GuardrailBlock {
  blocked: true;
  reason: string;
  atlasTag?: MitreAtlasTag;
}

export type GuardrailHookOutcome<T> = void | undefined | T | GuardrailBlock;

/** A hook blocked the call (or failed: hooks fail closed). */
export interface GuardrailHookBlocked extends GuardrailBlock {
  provider: string;
  stage: 'inlet' | 'outlet';
}

const isBlock = (v: unknown): v is GuardrailBlock => !!v && typeof v === 'object' && (v as any).blocked === true;

/**
 * Declarative guardrail contributions a `CuratorPlugin` may register.
 */
export interface CuratorPluginGuardrails {
  ingressSignatures?: Record<string, IngressSignatureRule>;
  blockedAgentTools?: string[];
  allowedEndpointHosts?: string[];
  blockedEndpointHosts?: string[];
  redactionRules?: Record<string, RedactionRule>;
  providers?: IGuardrailProvider[];
}

/** Bidirectional control characters and null bytes used for homoglyph / trojan-source smuggling. */
const CONTROL_CHAR_SMUGGLING_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\u202A-\u202E\u2066-\u2069]/g;

export class GuardrailService {
  private static providers: IGuardrailProvider[] = [];
  private static ingressSignatures = new Map<string, IngressSignatureRule>(Object.entries(BUILTIN_INGRESS_SIGNATURES));
  private static blockedToolPatterns = new Map<string, RegExp>(
    BUILTIN_BLOCKED_AGENT_TOOLS.map((p) => [p.toLowerCase(), globToRegExp(p)])
  );
  private static blockedEndpointHosts = new Map<string, RegExp>(
    BUILTIN_BLOCKED_ENDPOINT_HOSTS.map((h) => [h.toLowerCase(), globToRegExp(h)])
  );
  private static allowedEndpointHosts = new Map<string, RegExp>();

  // ── Pluggable Registry API ────────────────────────────────────────────────

  /** Registers an external guardrail provider (Llama Guard, NeMo Guardrails, Presidio). */
  static registerProvider(provider: IGuardrailProvider): () => void {
    this.providers = this.providers.filter((p) => p.name !== provider.name);
    this.providers.push(provider);
    return () => {
      this.providers = this.providers.filter((p) => p !== provider);
    };
  }

  static clearProviders(): void {
    this.providers = [];
  }

  /** Registers or overrides a named ingress filter signature (regex or predicate). */
  static registerIngressSignature(name: string, rule: IngressSignatureRule): () => void {
    this.ingressSignatures.set(name, rule);
    return () => {
      this.ingressSignatures.delete(name);
    };
  }

  static unregisterIngressSignature(name: string): boolean {
    return this.ingressSignatures.delete(name);
  }

  /** Registers a tool name or `*` wildcard pattern blocked from LLM agent tool-calling. */
  static registerBlockedToolPattern(pattern: string): () => void {
    const key = pattern.trim().toLowerCase();
    this.blockedToolPatterns.set(key, globToRegExp(key));
    return () => {
      this.blockedToolPatterns.delete(key);
    };
  }

  static unregisterBlockedToolPattern(pattern: string): boolean {
    return this.blockedToolPatterns.delete(pattern.trim().toLowerCase());
  }

  /** Registers a blocked host or `*` wildcard pattern for LLM/vector endpoints. */
  static registerBlockedEndpointHost(hostPattern: string): () => void {
    const key = hostPattern.trim().toLowerCase();
    this.blockedEndpointHosts.set(key, globToRegExp(key));
    return () => {
      this.blockedEndpointHosts.delete(key);
    };
  }

  /** Registers an allowed host or `*` wildcard pattern for LLM/vector endpoints (enforces whitelist when non-empty). */
  static registerAllowedEndpointHost(hostPattern: string): () => void {
    const key = hostPattern.trim().toLowerCase();
    this.allowedEndpointHosts.set(key, globToRegExp(key));
    return () => {
      this.allowedEndpointHosts.delete(key);
    };
  }

  /** Applies declarative guardrail contributions from a `CuratorPlugin`. */
  static registerPluginGuardrails(spec: CuratorPluginGuardrails): void {
    for (const [name, rule] of Object.entries(spec.ingressSignatures ?? {})) {
      this.registerIngressSignature(name, rule);
    }
    for (const pattern of spec.blockedAgentTools ?? []) {
      this.registerBlockedToolPattern(pattern);
    }
    for (const host of spec.blockedEndpointHosts ?? []) {
      this.registerBlockedEndpointHost(host);
    }
    for (const host of spec.allowedEndpointHosts ?? []) {
      this.registerAllowedEndpointHost(host);
    }
    for (const [name, rule] of Object.entries(spec.redactionRules ?? {})) {
      SecretService.registerRedactionRule(name, rule);
    }
    for (const provider of spec.providers ?? []) {
      this.registerProvider(provider);
    }
  }

  /** Resets all guardrail registries to built-in defaults (useful in tests). */
  static resetDefaults(): void {
    this.providers = [];
    this.ingressSignatures = new Map<string, IngressSignatureRule>(Object.entries(BUILTIN_INGRESS_SIGNATURES));
    this.blockedToolPatterns = new Map<string, RegExp>(
      BUILTIN_BLOCKED_AGENT_TOOLS.map((p) => [p.toLowerCase(), globToRegExp(p)])
    );
    this.blockedEndpointHosts = new Map<string, RegExp>(
      BUILTIN_BLOCKED_ENDPOINT_HOSTS.map((h) => [h.toLowerCase(), globToRegExp(h)])
    );
    this.allowedEndpointHosts.clear();
    SecretService.resetRedactionRules();
  }

  // ── Ingress Evaluation ────────────────────────────────────────────────────

  /**
   * Deterministic synchronous ingress filter:
   * 1. Strips control-character / bidirectional override smuggling.
   * 2. Truncates or rejects prompts exceeding maxPromptChars.
   * 3. Evaluates pluggable ingress signatures (MITRE ATLAS AML.T0051).
   * 4. Evaluates per-call allow/block regex filters.
   */
  static validatePromptSync(input: string, config?: IngressGuardrailConfig): IngressValidationResult {
    const raw = typeof input === 'string' ? input : String(input ?? '');
    const defaultMax = process.env.CURATOR_MAX_PROMPT_CHARS
      ? parseInt(process.env.CURATOR_MAX_PROMPT_CHARS, 10)
      : 100_000;
    const maxChars = config?.maxPromptChars ?? (Number.isFinite(defaultMax) && defaultMax > 0 ? defaultMax : 100_000);
    const truncateOnOverflow = config?.truncateOnOverflow ?? true;
    const blockInjection = config?.blockPromptInjection ?? (process.env.CURATOR_DISABLE_INJECTION_GUARD !== '1');

    let sanitized = raw.replace(CONTROL_CHAR_SMUGGLING_REGEX, '');
    let truncated = false;

    if (sanitized.length > maxChars) {
      if (!truncateOnOverflow) {
        return {
          allowed: false,
          sanitizedPrompt: sanitized.slice(0, maxChars),
          truncated: true,
          reason: `Prompt length (${sanitized.length}) exceeds maximum allowed (${maxChars} chars).`,
          atlasTag: MitreAtlasTag.PROMPT_INJECTION,
          matchedRule: 'max_prompt_chars',
        };
      }
      sanitized = sanitized.slice(0, maxChars);
      truncated = true;
    }

    if (blockInjection) {
      for (const [name, sig] of this.ingressSignatures.entries()) {
        const isEnabled = typeof sig.enabled === 'function' ? sig.enabled() : (sig.enabled ?? true);
        if (!isEnabled) continue;
        const matched = typeof sig.pattern === 'function' ? sig.pattern(sanitized) : sig.pattern.test(sanitized);
        if (matched) {
          const tag = sig.atlasTag ?? MitreAtlasTag.PROMPT_INJECTION;
          logger.warn(`[GuardrailService] Blocked prompt injection attempt (${name}) [${tag}]`);
          return {
            allowed: false,
            sanitizedPrompt: sanitized,
            truncated,
            reason: sig.reason ?? `Prompt blocked by ingress guardrail: matched signature '${name}'.`,
            atlasTag: tag,
            matchedRule: name,
          };
        }
      }
    }

    if (config?.blockPatterns) {
      for (const pat of config.blockPatterns) {
        const re = typeof pat === 'string' ? new RegExp(pat, 'i') : pat;
        if (re.test(sanitized)) {
          return {
            allowed: false,
            sanitizedPrompt: sanitized,
            truncated,
            reason: `Prompt blocked by custom ingress regex filter (${re.source}).`,
            atlasTag: MitreAtlasTag.PROMPT_INJECTION,
            matchedRule: re.source,
          };
        }
      }
    }

    if (config?.allowPattern) {
      const allowRe = typeof config.allowPattern === 'string' ? new RegExp(config.allowPattern) : config.allowPattern;
      if (!allowRe.test(sanitized)) {
        return {
          allowed: false,
          sanitizedPrompt: sanitized,
          truncated,
          reason: `Prompt did not match required ingress allow pattern (${allowRe.source}).`,
          atlasTag: MitreAtlasTag.PROMPT_INJECTION,
          matchedRule: allowRe.source,
        };
      }
    }

    return {
      allowed: true,
      sanitizedPrompt: sanitized,
      truncated,
    };
  }

  /**
   * Full ingress inspection pipeline: runs deterministic filters first, then any registered
   * external guardrail providers (Llama Guard / NeMo Guardrails / HTTP gateway).
   */
  static async inspectPromptIngress(
    input: string,
    config?: IngressGuardrailConfig,
    context?: Record<string, unknown>
  ): Promise<IngressValidationResult> {
    const syncResult = this.validatePromptSync(input, config);
    if (!syncResult.allowed) {
      return syncResult;
    }

    const gatewayUrl = process.env.CURATOR_GUARDRAIL_URL;
    if (gatewayUrl) {
      try {
        const res = await fetch(gatewayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: syncResult.sanitizedPrompt, context }),
        });
        if (res.ok) {
          const body: any = await res.json();
          if (body && body.allowed === false) {
            return {
              allowed: false,
              sanitizedPrompt: syncResult.sanitizedPrompt,
              truncated: syncResult.truncated,
              reason: body.reason || 'Blocked by external guardrail gateway.',
              atlasTag: body.atlasTag || MitreAtlasTag.PROMPT_INJECTION,
              matchedRule: 'external_gateway',
            };
          }
        }
      } catch (err: any) {
        logger.warn(`[GuardrailService] External guardrail gateway (${gatewayUrl}) check failed: ${err.message}`);
      }
    }

    for (const provider of this.providersFor(typeof context?.agentName === 'string' ? context.agentName : undefined)) {
      if (provider.evaluateIngress) {
        const res = await provider.evaluateIngress(syncResult.sanitizedPrompt, context);
        if (!res.allowed) {
          return {
            allowed: false,
            sanitizedPrompt: syncResult.sanitizedPrompt,
            truncated: syncResult.truncated,
            reason: res.reason || `Blocked by guardrail provider '${provider.name}'.`,
            atlasTag: res.atlasTag || MitreAtlasTag.PROMPT_INJECTION,
            matchedRule: provider.name,
          };
        }
      }
    }

    return syncResult;
  }

  // ── Tool & Endpoint Policies ──────────────────────────────────────────────

  /**
   * Checks whether a tool is blocked from LLM agent tool-calling by pluggable pattern or tool metadata (`allowRawExecution: false`).
   */
  static isRawExecutionTool(toolName: string, tool?: any): boolean {
    if (!toolName) return false;
    if (tool?.allowRawExecution === false) return true;
    if (tool?.allowRawExecution === true) return false;
    const normalized = toolName.trim().toLowerCase();
    for (const re of this.blockedToolPatterns.values()) {
      if (re.test(normalized)) return true;
    }
    return false;
  }

  /**
   * Validates tool call arguments against the tool's JSON Schema using Ajv.
   */
  static validateToolParameters(
    schema: Record<string, unknown> | undefined,
    args: unknown
  ): { valid: boolean; errors?: string[] } {
    if (args !== undefined && args !== null && (typeof args !== 'object' || Array.isArray(args))) {
      return {
        valid: false,
        errors: ['Tool arguments must be a JSON object.'],
      };
    }

    if (!schema || typeof schema !== 'object' || Object.keys(schema).length === 0) {
      return { valid: true };
    }

    try {
      const normalizedSchema: Record<string, unknown> = {
        type: 'object',
        ...schema,
      };
      const validate = sharedAjv.compile(normalizedSchema);
      const valid = validate(args ?? {});
      if (!valid) {
        const errs = (validate.errors || []).map(
          (e: any) => `${e.instancePath || '/'} ${e.message || 'invalid'}`.trim()
        );
        return { valid: false, errors: errs };
      }
      return { valid: true };
    } catch (err: any) {
      return { valid: false, errors: [`Schema compilation error: ${err.message}`] };
    }
  }

  /**
   * Validates LLM / Vector infrastructure endpoint URLs against pluggable host blocklists and whitelists.
   */
  static validateEndpointUrl(urlStr: string): { allowed: boolean; reason?: string } {
    if (!urlStr || typeof urlStr !== 'string') {
      return { allowed: false, reason: 'Endpoint URL must be a non-empty string.' };
    }

    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return { allowed: false, reason: `Malformed endpoint URL: '${urlStr}'.` };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { allowed: false, reason: `Disallowed endpoint protocol '${parsed.protocol}'. Only http: and https: are permitted.` };
    }

    const hostname = parsed.hostname.toLowerCase();

    for (const re of this.blockedEndpointHosts.values()) {
      if (re.test(hostname)) {
        return {
          allowed: false,
          reason: `Access to blocked or cloud metadata endpoint '${hostname}' is strictly forbidden.`,
        };
      }
    }

    // Check programmatic allowedEndpointHosts or CURATOR_ALLOWED_LLM_HOSTS env
    const allowedHostsEnv = process.env.CURATOR_ALLOWED_LLM_HOSTS;
    const envMatchers = allowedHostsEnv
      ? allowedHostsEnv
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean)
          .map(globToRegExp)
      : [];
    const allAllowedMatchers = [...this.allowedEndpointHosts.values(), ...envMatchers];

    if (allAllowedMatchers.length > 0 && !allAllowedMatchers.some((re) => re.test(hostname))) {
      return {
        allowed: false,
        reason: `Endpoint host '${hostname}' is not in the allowed LLM endpoint whitelist.`,
      };
    }

    return { allowed: true };
  }

  // ── Unified Egress Delegates (SecretService + OutputFormats) ─────────────

  /**
   * Delegates to `SecretService.mask` (which runs all pluggable redaction rules: tokens, PCI-DSS PANs, SSNs, etc.)
   * and optional XSS stripping from `OutputFormats`. Kept for convenience so callers don't duplicate logic.
   */
  static redactPiiAndPci(text: string, config?: EgressSanitizationConfig): string {
    if (!text || typeof text !== 'string') return text;
    let out = SecretService.mask(text);
    if (config?.redactEmails) {
      out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED:PII_EMAIL]');
    }
    if (config?.redactPhones) {
      out = out.replace(/(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[REDACTED:PII_PHONE]');
    }
    if (config?.stripXssVectors) {
      out = stripUnsafeHtml(out);
    }
    return out;
  }

  static sanitizeModelOutput(
    output: string,
    secretsMap?: Map<string, string>,
    config?: EgressSanitizationConfig
  ): string {
    if (!output || typeof output !== 'string') return output;
    const masked = SecretService.mask(output, secretsMap);
    return config ? this.redactPiiAndPci(masked, config) : masked;
  }

  // ── Provider hooks around model calls (inlet / outlet / egress) ─────────────

  /** Providers that apply to `agentName`, by priority (stable for equal priorities). */
  static providersFor(agentName?: string): IGuardrailProvider[] {
    return this.providers
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !p.appliesTo?.length || (!!agentName && p.appliesTo.some((g) => globToRegExp(g.toLowerCase()).test(agentName.toLowerCase()))))
      .sort((a, b) => (a.p.priority ?? 100) - (b.p.priority ?? 100) || a.i - b.i)
      .map(({ p }) => p);
  }

  /**
   * Runs the providers' `inlet` hooks on a model request. A hook may change prompts, messages and sampling, but the
   * tools it returns are cut to the original set and model/endpoint/credentials/signal are restored.
   */
  static async runInlet(
    request: LlmRequest,
    context: GuardrailHookContext
  ): Promise<{ request: LlmRequest; blocked?: undefined } | { blocked: GuardrailHookBlocked; request?: undefined }> {
    let current = request;
    for (const provider of this.providersFor(context.agentName)) {
      if (!provider.inlet) continue;
      let out: GuardrailHookOutcome<LlmRequest>;
      try {
        out = await provider.inlet(current, context);
      } catch (err: any) {
        return { blocked: { blocked: true, reason: `Guardrail provider '${provider.name}' failed: ${err?.message ?? err}`, provider: provider.name, stage: 'inlet' } };
      }
      if (isBlock(out)) return { blocked: { ...out, provider: provider.name, stage: 'inlet' } };
      if (out && typeof out === 'object') {
        const allowed = new Set((request.tools ?? []).map((t) => t.name));
        const tools = (out.tools ?? []).filter((t) => allowed.has(t.name));
        current = {
          ...out,
          tools: request.tools ? tools : undefined,
          model: request.model,
          baseUrl: request.baseUrl,
          apiKey: request.apiKey,
          cachedContent: request.cachedContent,
          signal: request.signal,
        };
      }
    }
    return { request: current };
  }

  /** Runs the providers' `outlet` hooks on a model response; tool calls the model did not make are dropped. */
  static async runOutlet(
    response: LlmResponse,
    context: GuardrailHookContext
  ): Promise<{ response: LlmResponse; blocked?: undefined } | { blocked: GuardrailHookBlocked; response?: undefined }> {
    let current = response;
    for (const provider of this.providersFor(context.agentName)) {
      if (!provider.outlet) continue;
      let out: GuardrailHookOutcome<LlmResponse>;
      try {
        out = await provider.outlet(current, context);
      } catch (err: any) {
        return { blocked: { blocked: true, reason: `Guardrail provider '${provider.name}' failed: ${err?.message ?? err}`, provider: provider.name, stage: 'outlet' } };
      }
      if (isBlock(out)) return { blocked: { ...out, provider: provider.name, stage: 'outlet' } };
      if (out && typeof out === 'object') {
        const made = new Set((response.toolCalls ?? []).map((c) => `${c.id ?? ''}|${c.name}`));
        const toolCalls = (out.toolCalls ?? []).filter((c) => made.has(`${c.id ?? ''}|${c.name}`));
        current = { ...out, text: typeof out.text === 'string' ? out.text : '', toolCalls: toolCalls.length ? toolCalls : undefined };
      }
    }
    return { response: current };
  }

  /**
   * Egress for an agent's final output: the providers' `sanitizeEgress` in priority order, then the built-in masking
   * (`SecretService.mask`: hydrated secrets and redaction rules) last, so a provider can't undo it.
   */
  static async sanitizeEgress(
    output: string,
    context: Partial<GuardrailHookContext> = {},
    secretsMap?: Map<string, string>
  ): Promise<string> {
    let text = output;
    if (typeof text !== 'string') return text;
    for (const provider of this.providersFor(context.agentName)) {
      if (!provider.sanitizeEgress) continue;
      try {
        const next = await provider.sanitizeEgress(text, context as Record<string, unknown>);
        if (typeof next === 'string') text = next;
      } catch (err: any) {
        logger.warn(`[GuardrailService] sanitizeEgress of '${provider.name}' failed: ${err?.message ?? err}`);
      }
    }
    return SecretService.mask(text, secretsMap);
  }

  static escapeHtml = escapeHtml;
  static stripUnsafeHtml = stripUnsafeHtml;
  static escapeShellArg = escapeShellArg;
  static escapeSqlLiteral = escapeSqlLiteral;
  static escapeSqlIdentifier = escapeSqlIdentifier;
  static passesLuhnCheck = passesLuhnCheck;
}
