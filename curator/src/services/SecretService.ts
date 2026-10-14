import * as crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { AgentRoleService } from './AgentRoleService.js';

export interface SecretContext {
  projectId?: string | number | null;
  userId?: string | number | null;
  agentId?: string | number | null;
  prisma?: PrismaClient | any;
}

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

  /**
   * Universal string replacement helper for ES2020 compatibility.
   */
  private static replaceAll(str: string, search: string, replacement: string): string {
    return str.split(search).join(replacement);
  }

  /**
   * Derives a 32-byte key for AES-256-GCM from environment or fallback.
   */
  private static getMasterKey(): Buffer {
    const rawKey = process.env.CURATOR_SECRET_KEY || process.env.JWT_SECRET || 'curator-master-secret-key-32bytes-fallback';
    return crypto.createHash('sha256').update(rawKey).digest();
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
   * Clears in-memory secrets (useful between test runs).
   */
  static clearMemorySecrets(): void {
    this.inMemorySecrets.clear();
  }

  /**
   * Resolves a secret name into its raw plaintext value using:
   * 1. In-memory project registry
   * 2. Database projectSecret / secret table (if present in Prisma)
   * 3. Environment variables (process.env[NAME] or process.env[SECRET_NAME])
   */
  static async resolveSecret(name: string, context?: SecretContext): Promise<string | null> {
    if (!name) return null;

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

    let sanitized = text;

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

    // 2. Defense-in-depth: generic token pattern scrubbing
    // GitHub Personal Access Tokens (classic and fine-grained)
    sanitized = sanitized.replace(/gh[pousr]_[A-Za-z0-9_]{36,}/g, '[REDACTED:GITHUB_TOKEN]');
    // OpenAI / general sk- keys
    sanitized = sanitized.replace(/sk-[a-zA-Z0-9_\-]{20,}/g, '[REDACTED:API_KEY]');
    // Authorization: Bearer <token>
    sanitized = sanitized.replace(/(Authorization:\s*Bearer\s+)[A-Za-z0-9_\-\.]{16,}/gi, '$1[REDACTED:BEARER_TOKEN]');

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
