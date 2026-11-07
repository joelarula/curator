import * as crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { AgentRoleService } from './AgentRoleService.js';

export interface SecretContext {
  projectId?: string | number | null;
  userId?: string | number | null;
  agentId?: string | number | null;
  conversationId?: string | number | null;
  prisma?: PrismaClient | any;
}

export interface EphemeralSecretEntry {
  value: string;
  expiresAt: number;
  projectId?: string | number | null;
  agentId?: string | number | null;
  conversationId?: string | number | null;
}

export interface ISecretVaultProvider {
  readonly name: string;
  resolveDynamicSecret(name: string, context?: SecretContext): Promise<{ value: string; ttlMs?: number } | null>;
}

/**
 * Pluggable egress redaction rule (tokens, PII, PCI-DSS, or domain-specific patterns).
 */
export interface RedactionRule {
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: any[]) => string);
  /** Optional predicate or toggle; when false, the rule is skipped. */
  enabled?: boolean | (() => boolean);
}

/** Luhn check for 13-19 digit payment card numbers (PCI-DSS PAN). */
export function passesLuhnCheck(digitsOnly: string): boolean {
  if (digitsOnly.length < 13 || digitsOnly.length > 19) return false;
  if (/^(\d)\1+$/.test(digitsOnly)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = digitsOnly.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/** Built-in egress redaction rules; plugins/hosts can add, override, or disable rules by name. */
export const BUILTIN_REDACTION_RULES: Record<string, RedactionRule> = {
  GITHUB_TOKEN: {
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    replacement: '[REDACTED:GITHUB_TOKEN]',
  },
  API_KEY: {
    pattern: /sk-[a-zA-Z0-9_\-]{20,}/g,
    replacement: '[REDACTED:API_KEY]',
  },
  BEARER_TOKEN: {
    pattern: /(Authorization:\s*Bearer\s+)[A-Za-z0-9_\-\.]{16,}/gi,
    replacement: '$1[REDACTED:BEARER_TOKEN]',
  },
  PRIVATE_KEY: {
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[REDACTED:PRIVATE_KEY]',
  },
  AWS_KEY: {
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED:AWS_KEY]',
  },
  GCP_KEY: {
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    replacement: '[REDACTED:GCP_KEY]',
  },
  JWT: {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: '[REDACTED:JWT]',
  },
  PCI_PAN: {
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: (match: string) => (passesLuhnCheck(match.replace(/\D/g, '')) ? '[REDACTED:PCI_PAN]' : match),
  },
  PII_SSN: {
    pattern: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    replacement: '[REDACTED:PII_SSN]',
  },
  PII_EMAIL: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED:PII_EMAIL]',
    enabled: () => process.env.CURATOR_REDACT_PII_EMAILS === '1',
  },
  PII_PHONE: {
    pattern: /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
    replacement: '[REDACTED:PII_PHONE]',
    enabled: () => process.env.CURATOR_REDACT_PII_PHONES === '1',
  },
};

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface HydrateResult<T> {
  hydrated: T;
  secretsMap: Map<string, string>; // rawSecretValue -> secretName
}

export class SecretService {
  private static inMemorySecrets = new Map<string, string>();
  private static ephemeralSecrets = new Map<string, EphemeralSecretEntry[]>();
  private static vaultProviders: ISecretVaultProvider[] = [];
  private static redactionRules = new Map<string, RedactionRule>(Object.entries(BUILTIN_REDACTION_RULES));
  private static processEphemeralKey: Buffer | null = null;

  /** Registers or overrides an egress redaction rule by name. */
  static registerRedactionRule(name: string, rule: RedactionRule): () => void {
    this.redactionRules.set(name, rule);
    return () => {
      this.redactionRules.delete(name);
    };
  }

  /** Removes a redaction rule by name. */
  static unregisterRedactionRule(name: string): boolean {
    return this.redactionRules.delete(name);
  }

  /** Resets redaction rules to BUILTIN_REDACTION_RULES. */
  static resetRedactionRules(): void {
    this.redactionRules = new Map<string, RedactionRule>(Object.entries(BUILTIN_REDACTION_RULES));
  }

  /**
   * Universal string replacement helper for ES2020 compatibility.
   */
  private static replaceAll(str: string, search: string, replacement: string): string {
    return str.split(search).join(replacement);
  }

  /**
   * Derives a 32-byte key for AES-256-GCM from environment or generates a per-process CSPRNG key
   * (never falls back to a static hardcoded secret in code).
   */
  private static getMasterKey(): Buffer {
    const rawKey = process.env.CURATOR_SECRET_KEY || process.env.JWT_SECRET;
    if (rawKey) {
      return crypto.createHash('sha256').update(rawKey).digest();
    }
    if (process.env.CURATOR_REQUIRE_MASTER_KEY === '1') {
      throw new Error('[SecretService] CURATOR_SECRET_KEY is required when CURATOR_REQUIRE_MASTER_KEY=1.');
    }
    if (!this.processEphemeralKey) {
      this.processEphemeralKey = crypto.randomBytes(32);
    }
    return this.processEphemeralKey;
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   */
  static encrypt(plaintext: string): EncryptedPayload {
    const key = this.getMasterKey();
    const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      ciphertext,
      iv: iv.toString('hex'),
      tag
    };
  }

  /**
   * Decrypts an AES-256-GCM payload.
   */
  static decrypt(payload: EncryptedPayload): string {
    const key = this.getMasterKey();
    const iv = Buffer.from(payload.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));

    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Manually registers a secret in memory (useful for testing, runtime overrides, or dynamic sessions).
   */
  static registerSecret(name: string, value: string, projectId?: string | number | null): void {
    if (projectId) {
      this.inMemorySecrets.set(`${projectId}:${name}`, value);
    }
    // Also store globally by name
    this.inMemorySecrets.set(name, value);
  }

  /**
   * Registers a scoped, short-lived secret bound to a TTL and optional agent/conversation/project scope.
   * Expired entries are automatically evicted upon lookup.
   */
  static registerEphemeralSecret(
    name: string,
    value: string,
    options: {
      ttlMs?: number;
      projectId?: string | number | null;
      agentId?: string | number | null;
      conversationId?: string | number | null;
    } = {}
  ): void {
    const ttlMs = options.ttlMs ?? 15 * 60 * 1000; // Default 15 minutes
    const entry: EphemeralSecretEntry = {
      value,
      expiresAt: Date.now() + ttlMs,
      projectId: options.projectId,
      agentId: options.agentId,
      conversationId: options.conversationId,
    };
    const list = this.ephemeralSecrets.get(name) ?? [];
    list.unshift(entry);
    this.ephemeralSecrets.set(name, list);
  }

  /**
   * Registers an external dynamic secret vault provider (e.g. HashiCorp Vault, IAM STS, Workload Identity Federation).
   */
  static registerVaultProvider(provider: ISecretVaultProvider): void {
    this.vaultProviders = this.vaultProviders.filter((p) => p.name !== provider.name);
    this.vaultProviders.push(provider);
  }

  /**
   * Clears in-memory secrets, ephemeral session secrets, and vault providers (useful between test runs).
   */
  static clearMemorySecrets(): void {
    this.inMemorySecrets.clear();
    this.ephemeralSecrets.clear();
    this.vaultProviders = [];
  }

  /**
   * Resolves a secret name into its raw plaintext value using:
   * 0. Scoped, short-lived ephemeral session tokens & external dynamic vault providers
   * 1. In-memory project registry
   * 2. Database projectSecret / secret table (if present in Prisma)
   * 3. Environment variables (process.env[NAME] or process.env[SECRET_NAME])
   */
  static async resolveSecret(name: string, context?: SecretContext): Promise<string | null> {
    if (!name) return null;

    // 0a. Check scoped short-lived ephemeral secrets first
    const ephList = this.ephemeralSecrets.get(name);
    if (ephList && ephList.length > 0) {
      const now = Date.now();
      const active = ephList.filter((e) => e.expiresAt > now);
      if (active.length === 0) {
        this.ephemeralSecrets.delete(name);
      } else {
        this.ephemeralSecrets.set(name, active);
        for (const entry of active) {
          if (entry.projectId != null && context?.projectId != null && String(entry.projectId) !== String(context.projectId)) {
            continue;
          }
          if (entry.agentId != null && context?.agentId != null && String(entry.agentId) !== String(context.agentId)) {
            continue;
          }
          if (entry.conversationId != null && context?.conversationId != null && String(entry.conversationId) !== String(context.conversationId)) {
            continue;
          }
          // If an entry is scoped to an agent/conversation/project, require the caller context to provide that scope
          if (entry.agentId != null && context?.agentId == null) continue;
          if (entry.conversationId != null && context?.conversationId == null) continue;
          if (entry.projectId != null && context?.projectId == null) continue;
          return entry.value;
        }
      }
    }

    // 0b. Query registered dynamic secret providers (Vault / IAM / Workload Identity)
    for (const provider of this.vaultProviders) {
      try {
        const res = await provider.resolveDynamicSecret(name, context);
        if (res && res.value) {
          if (res.ttlMs && res.ttlMs > 0) {
            this.registerEphemeralSecret(name, res.value, {
              ttlMs: res.ttlMs,
              projectId: context?.projectId,
              agentId: context?.agentId,
              conversationId: context?.conversationId,
            });
          }
          return res.value;
        }
      } catch (err) {
        logger.warn(`[SecretService] Vault provider '${provider.name}' failed resolving '${name}':`, err);
      }
    }

    // 1. Check in-memory secrets
    if (context?.projectId) {
      const scopedKey = `${context.projectId}:${name}`;
      if (this.inMemorySecrets.has(scopedKey)) {
        return this.inMemorySecrets.get(scopedKey)!;
      }
    }
    if (this.inMemorySecrets.has(name)) {
      return this.inMemorySecrets.get(name)!;
    }

    // 2. Check Prisma database if available
    const prisma = context?.prisma;
    if (prisma) {
      try {
        const delegate = prisma.projectSecret || prisma.secret;
        if (delegate?.findFirst) {
          const whereClause: any = { name };
          if (context?.projectId) {
            whereClause.OR = [
              { projectId: context.projectId },
              { projectId: 'system' },
              { projectId: null }
            ];
          }
          const record = await delegate.findFirst({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
          });

          if (record) {
            if (record.iv && record.tag && record.ciphertext) {
              return this.decrypt({
                ciphertext: record.ciphertext,
                iv: record.iv,
                tag: record.tag
              });
            }
            if (record.value) return record.value;
            if (record.ciphertext) return record.ciphertext;
          }
        }
      } catch (err) {
        logger.warn(`[SecretService] Failed querying database for secret '${name}':`, err);
      }
    }

    // 3. Fallback to process.env
    if (process.env[name] !== undefined) {
      return process.env[name]!;
    }
    const prefixed = `SECRET_${name}`;
    if (process.env[prefixed] !== undefined) {
      return process.env[prefixed]!;
    }

    return null;
  }

  /**
   * Regular expressions for discovering secret placeholders:
   * - $secret:KEY_NAME
   * - {{secrets.KEY_NAME}}
   * - secret://KEY_NAME
   * - secret('KEY_NAME')
   */
  static readonly PLACEHOLDER_REGEXES = [
    /\$secret:([a-zA-Z0-9_-]+)/g,
    /\{\{\s*secrets\.([a-zA-Z0-9_-]+)\s*\}\}/g,
    /secret:\/\/([a-zA-Z0-9_-]+)/g,
    /secret\(['"]([a-zA-Z0-9_-]+)['"]\)/g
  ];

  /**
   * Checks whether a value contains any secret placeholders.
   */
  static hasPlaceholder(val: unknown): boolean {
    if (typeof val === 'string') {
      return this.PLACEHOLDER_REGEXES.some(r => {
        r.lastIndex = 0;
        return r.test(val);
      });
    }
    if (typeof val === 'object' && val !== null) {
      return Object.values(val).some(v => this.hasPlaceholder(v));
    }
    return false;
  }

  /**
   * Hydrates all secret placeholders in an object, array, or string into their actual values.
   * Tracks all resolved raw secrets into `secretsMap` for safe execution and egress scrubbing.
   */
  static async hydrate<T>(input: T, context?: SecretContext): Promise<HydrateResult<T>> {
    const secretsMap = new Map<string, string>(); // rawSecretValue -> secretName

    const resolveString = async (str: string): Promise<string> => {
      let result = str;

      // Extract all unique secret names referenced in this string
      const matchedNames = new Set<string>();
      for (const regex of this.PLACEHOLDER_REGEXES) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(str)) !== null) {
          if (match[1]) matchedNames.add(match[1]);
        }
      }

      for (const secretName of matchedNames) {
        // RBAC validation if agentId is present
        if (context?.agentId && context.prisma) {
          const access = await AgentRoleService.validateAgentSecretAccess(
            context.prisma,
            context.agentId,
            secretName
          );
          if (!access.allowed) {
            throw new Error(`[SecretService] Access Denied: Agent '${context.agentId}' is not authorized to access secret '${secretName}'. ${access.reason || ''}`);
          }
        }

        const rawValue = await this.resolveSecret(secretName, context);
        if (rawValue !== null) {
          // Track for egress scrubbing if long enough (>= 4 chars)
          if (rawValue.length >= 4) {
            secretsMap.set(rawValue, secretName);
          }

          // Replace placeholder variations using split/join for ES2020 compatibility
          result = SecretService.replaceAll(result, `$secret:${secretName}`, rawValue);
          result = result.replace(new RegExp(`\\{\\{\\s*secrets\\.${secretName}\\s*\\}\\}`, 'g'), rawValue);
          result = SecretService.replaceAll(result, `secret://${secretName}`, rawValue);
          result = SecretService.replaceAll(result, `secret('${secretName}')`, rawValue);
          result = SecretService.replaceAll(result, `secret("${secretName}")`, rawValue);
        } else {
          logger.warn(`[SecretService] Warning: Secret '${secretName}' could not be resolved from vault or environment.`);
        }
      }

      return result;
    };

    const traverse = async (node: any): Promise<any> => {
      if (node === null || node === undefined) return node;

      if (typeof node === 'string') {
        return await resolveString(node);
      }

      if (Array.isArray(node)) {
        const copy: any[] = [];
        for (const item of node) {
          copy.push(await traverse(item));
        }
        return copy;
      }

      if (typeof node === 'object') {
        const copy: Record<string, any> = {};
        for (const [key, val] of Object.entries(node)) {
          copy[key] = await traverse(val);
        }
        return copy;
      }

      return node;
    };

    const hydrated = await traverse(input);
    return { hydrated, secretsMap };
  }

  /**
   * Egress Sanitizer:
   * Masks any occurrences of raw secrets in strings, errors, or serialized responses
   * before they enter LLM context, chat history, or database responses.
   */
  static mask(text: string, secretsMap?: Map<string, string>): string {
    if (!text || typeof text !== 'string') return text;

    let sanitized = text.replace(/\x00/g, '');

    // 1. Redact known secrets from secretsMap
    if (secretsMap && secretsMap.size > 0) {
      // Sort secrets by length descending to prevent partial replacement
      const sortedEntries = Array.from(secretsMap.entries()).sort(
        (a, b) => b[0].length - a[0].length
      );

      for (const [rawVal, secretName] of sortedEntries) {
        if (!rawVal || rawVal.length < 4) continue;
        sanitized = SecretService.replaceAll(sanitized, rawVal, `[REDACTED:${secretName}]`);
      }
    }

    // 2. Pluggable redaction rules (tokens, PCI-DSS PANs, SSNs, custom plugin patterns)
    for (const rule of this.redactionRules.values()) {
      const isEnabled = typeof rule.enabled === 'function' ? rule.enabled() : (rule.enabled ?? true);
      if (!isEnabled) continue;
      if (typeof rule.replacement === 'function') {
        sanitized = sanitized.replace(rule.pattern, rule.replacement as any);
      } else {
        sanitized = sanitized.replace(rule.pattern, rule.replacement);
      }
    }

    return sanitized;
  }

  /**
   * Cleanses raw secrets from an object (e.g. req.context) before database persistence.
   */
  static sanitizeContext(context: Record<string, any>, secretsMap?: Map<string, string>): Record<string, any> {
    if (!context || typeof context !== 'object') return context;
    try {
      const serialized = JSON.stringify(context);
      const masked = this.mask(serialized, secretsMap);
      return JSON.parse(masked);
    } catch (_) {
      return context;
    }
  }
}
