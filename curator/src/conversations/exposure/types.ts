/**
 * P2P Outer Exposure & Capability Gating Types
 */

export type PeerTrustTier =
  | 'cluster_admin'   // Trusted sibling node (full tool proxying, AST execution)
  | 'collaborator'    // Partner MiniApp / Extension (project-scoped tools & rooms)
  | 'contractor'      // Ephemeral task worker (answers RFPs, temporary leases)
  | 'guest';          // Public node (read-only search, public forum voting)

export interface EphemeralToolLease {
  leaseId: string;
  toolName: string;
  granteePeerId: string;
  conversationId?: string;
  grantedAt: string;
  expiresAt: string;
  maxInvocations?: number;
  invocationCount: number;
}

export interface InternalNodeState {
  cpuLoad?: number;            // 0.0 to 1.0 (e.g. 0.85 = 85%)
  memoryUsageMb?: number;
  quarantined?: boolean;       // Security tripwire
  throttledTools?: Set<string>; // Tools temporarily withheld due to system load
}

export interface PeerSessionContext {
  peerId: string;
  trustTier?: PeerTrustTier;
  activeProjectId?: string;
  participatingProjects?: string[];
  allowedTools?: string[];
  roleNames?: string[];
  conversationId?: string;
}

export interface GrantLeaseOptions {
  toolName: string;
  granteePeerId: string;
  conversationId?: string;
  durationMs?: number;
  maxInvocations?: number;
}

export interface ExposurePolicyRule {
  minTrustTier?: PeerTrustTier;
  requiredRoles?: string[];
  requiresProjectMatch?: boolean;
  maxCpuLoadThreshold?: number;
}
