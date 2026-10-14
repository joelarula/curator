import { EventEmitter } from 'events';
import type {
  PeerTrustTier,
  EphemeralToolLease,
  InternalNodeState,
  PeerSessionContext,
  GrantLeaseOptions,
  ExposurePolicyRule,
} from './types.js';

export interface ToolDescriptor {
  name: string;
  description?: string;
  requiredRole?: string;
  accessLevel?: string; // 'read_only' | 'read_write' | 'destructive' | 'admin'
  projectId?: string;
  isHeavyLlm?: boolean;
}

const HEAVY_TOOL_PREFIXES = ['llama_', 'generate_embeddings', 'llm_batch_', 'heavy_model_'];

/**
 * Outer Exposure Controller
 * Decouples internal capabilities from outward-facing exposure.
 * Evaluates request-time access across Trust-Tiers, Ephemeral Leases,
 * Internal Load Tripwires, and Multi-Tenant Project Boundaries.
 */
export class ExposurePolicyController extends EventEmitter {
  private activeLeases: Map<string, EphemeralToolLease> = new Map();
  private leaseTimers: Map<string, NodeJS.Timeout> = new Map();
  private internalState: InternalNodeState = {
    cpuLoad: 0.1,
    quarantined: false,
    throttledTools: new Set(),
  };

  private customRules: Map<string, ExposurePolicyRule> = new Map();

  constructor() {
    super();
  }

  public getState(): Readonly<InternalNodeState> {
    return { ...this.internalState };
  }

  /**
   * Updates internal operational metrics (CPU load, memory, quarantine tripwires).
   */
  public setInternalState(updates: Partial<InternalNodeState>): void {
    const prevState = { ...this.internalState };
    this.internalState = {
      ...this.internalState,
      ...updates,
      throttledTools: updates.throttledTools || this.internalState.throttledTools || new Set(),
    };

    // Automatic load-shedding: throttle heavy LLM tools if CPU load exceeds 85%
    if (typeof updates.cpuLoad === 'number') {
      if (updates.cpuLoad >= 0.85) {
        for (const prefix of HEAVY_TOOL_PREFIXES) {
          this.internalState.throttledTools?.add(prefix);
        }
      } else if (prevState.cpuLoad !== undefined && prevState.cpuLoad >= 0.85 && updates.cpuLoad < 0.75) {
        // Recovery hysteresis: un-throttle heavy tools once CPU drops below 75%
        for (const prefix of HEAVY_TOOL_PREFIXES) {
          this.internalState.throttledTools?.delete(prefix);
        }
      }
    }

    this.emit('state_changed', this.internalState);
    this.emit('exposure_changed', { reason: 'internal_state_update' });
  }

  /**
   * Configures a custom exposure rule for a tool name.
   */
  public setToolRule(toolName: string, rule: ExposurePolicyRule): void {
    this.customRules.set(toolName, rule);
    this.emit('exposure_changed', { toolName, rule });
  }

  /**
   * Grants an ephemeral capability lease to a specific peer.
   */
  public grantLease(options: GrantLeaseOptions): EphemeralToolLease {
    const duration = options.durationMs || 300000; // Default: 5 minutes
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration).toISOString();
    const leaseId = `lease_${options.granteePeerId}_${options.toolName}_${Date.now()}`;

    const lease: EphemeralToolLease = {
      leaseId,
      toolName: options.toolName,
      granteePeerId: options.granteePeerId,
      conversationId: options.conversationId,
      grantedAt: now.toISOString(),
      expiresAt,
      maxInvocations: options.maxInvocations,
      invocationCount: 0,
    };

    this.activeLeases.set(leaseId, lease);

    // Schedule automatic lease expiry timer
    const timer = setTimeout(() => {
      this.revokeLease(leaseId, 'expired');
    }, duration);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    this.leaseTimers.set(leaseId, timer);

    this.emit('lease_granted', lease);
    this.emit('exposure_changed', { peerId: options.granteePeerId, toolName: options.toolName, action: 'grant' });
    return lease;
  }

  /**
   * Revokes an active ephemeral lease immediately.
   */
  public revokeLease(leaseId: string, reason: string = 'manual_revocation'): boolean {
    const lease = this.activeLeases.get(leaseId);
    if (!lease) return false;

    const timer = this.leaseTimers.get(leaseId);
    if (timer) {
      clearTimeout(timer);
      this.leaseTimers.delete(leaseId);
    }

    this.activeLeases.delete(leaseId);
    this.emit('lease_revoked', { lease, reason });
    this.emit('exposure_changed', { peerId: lease.granteePeerId, toolName: lease.toolName, action: 'revoke' });
    return true;
  }

  /**
   * Lists active leases, optionally filtered by peerId.
   */
  public getActiveLeases(peerId?: string): EphemeralToolLease[] {
    const all = Array.from(this.activeLeases.values());
    if (!peerId) return all;
    return all.filter((l) => l.granteePeerId === peerId);
  }

  /**
   * Evaluates whether a peer session is permitted to see or call a given tool.
   */
  public evaluateToolAccess(
    tool: ToolDescriptor,
    session: PeerSessionContext
  ): { allowed: boolean; reason?: string } {
    // 1. Security Tripwire Quarantine
    if (this.internalState.quarantined) {
      if (session.trustTier !== 'cluster_admin') {
        return {
          allowed: false,
          reason: 'Access Denied: Node is currently in security quarantine mode. Outer exposure suspended.',
        };
      }
    }

    // 2. Ephemeral Lease Check (Takes immediate precedence for targeted collaboration)
    const matchingLease = this.findMatchingLease(session.peerId, tool.name, session.conversationId);
    if (matchingLease) {
      if (matchingLease.maxInvocations && matchingLease.invocationCount >= matchingLease.maxInvocations) {
        this.revokeLease(matchingLease.leaseId, 'max_invocations_reached');
      } else {
        return { allowed: true };
      }
    }

    // 3. Load Shedding & Heavy Tool Throttling
    if (this.isToolThrottled(tool.name)) {
      if (session.trustTier !== 'cluster_admin') {
        return {
          allowed: false,
          reason: `Tool '${tool.name}' is temporarily throttled due to high system load (${Math.round((this.internalState.cpuLoad || 0) * 100)}%).`,
        };
      }
    }

    // 4. Multi-Tenant Project Boundary Isolation (AGENTS.md §4.4)
    if (tool.projectId) {
      const allowedProjects = new Set<string>();
      if (session.activeProjectId) allowedProjects.add(session.activeProjectId);
      if (session.participatingProjects) {
        for (const p of session.participatingProjects) allowedProjects.add(p);
      }
      if (!allowedProjects.has(tool.projectId) && !allowedProjects.has('system')) {
        return {
          allowed: false,
          reason: `Project boundary isolation: Tool belongs to project '${tool.projectId}', but peer is scoped to [${Array.from(allowedProjects).join(', ')}].`,
        };
      }
    }

    // 5. Custom Rule Evaluation
    const customRule = this.customRules.get(tool.name);
    if (customRule) {
      if (customRule.minTrustTier && !this.satisfiesTrustTier(session.trustTier, customRule.minTrustTier)) {
        return {
          allowed: false,
          reason: `Requires minimum trust tier '${customRule.minTrustTier}', got '${session.trustTier || 'guest'}'.`,
        };
      }
    }

    // 6. Trust-Tier Whitelist & RBAC
    const trustTier = session.trustTier || 'guest';

    // ClusterAdmin has unrestricted tool access
    if (trustTier === 'cluster_admin') {
      return { allowed: true };
    }

    // Explicit allowedTools whitelist check
    if (session.allowedTools && Array.isArray(session.allowedTools)) {
      if (session.allowedTools.includes('*') || session.allowedTools.includes(tool.name)) {
        return { allowed: true };
      }
    }

    // Role-based matching
    if (tool.requiredRole) {
      const hasRole = session.roleNames?.includes(tool.requiredRole);
      if (hasRole) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Access Denied: Requires role '${tool.requiredRole}'.`,
      };
    }

    // Tier defaults
    if (trustTier === 'guest') {
      // Guests only get read_only tools
      if (tool.accessLevel && tool.accessLevel !== 'read_only') {
        return {
          allowed: false,
          reason: 'Access Denied: Unauthenticated guest peers can only access read-only tools.',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Filters an array of tools for an outer MCP tools/list manifest.
   */
  public filterTools<T extends ToolDescriptor>(tools: T[], session: PeerSessionContext): T[] {
    return tools.filter((tool) => this.evaluateToolAccess(tool, session).allowed);
  }

  /**
   * Records an invocation against an active ephemeral lease.
   */
  public recordLeaseInvocation(peerId: string, toolName: string, conversationId?: string): void {
    const lease = this.findMatchingLease(peerId, toolName, conversationId);
    if (lease) {
      lease.invocationCount += 1;
      if (lease.maxInvocations && lease.invocationCount >= lease.maxInvocations) {
        this.revokeLease(lease.leaseId, 'max_invocations_reached');
      }
    }
  }

  private findMatchingLease(peerId: string, toolName: string, conversationId?: string): EphemeralToolLease | undefined {
    const now = new Date();
    for (const lease of this.activeLeases.values()) {
      if (lease.granteePeerId === peerId && lease.toolName === toolName) {
        if (new Date(lease.expiresAt) > now) {
          if (!lease.conversationId || lease.conversationId === conversationId) {
            return lease;
          }
        }
      }
    }
    return undefined;
  }

  private isToolThrottled(toolName: string): boolean {
    if (!this.internalState.throttledTools) return false;
    if (this.internalState.throttledTools.has(toolName)) return true;
    for (const prefix of this.internalState.throttledTools) {
      if (toolName.startsWith(prefix)) return true;
    }
    return false;
  }

  private satisfiesTrustTier(actual?: PeerTrustTier, required?: PeerTrustTier): boolean {
    const tierRanks: Record<PeerTrustTier, number> = {
      guest: 1,
      contractor: 2,
      collaborator: 3,
      cluster_admin: 4,
    };
    const actRank = tierRanks[actual || 'guest'] || 1;
    const reqRank = tierRanks[required || 'guest'] || 1;
    return actRank >= reqRank;
  }
}
