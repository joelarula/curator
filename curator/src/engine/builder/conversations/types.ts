import type { CuratorAstNode } from '../../CuratorAst.js';
import type { VoteChoice } from '../../../conversations/types.js';

export interface AskOptions {
  to?: string;
  role?: string;
  to_role?: string;
  as_role?: string;
  targetRole?: string;
  senderRole?: string;
  query: string;
  timeout?: string | number;
  as?: string;
}

export interface ProposeOptions {
  to?: string;
  role?: string;
  to_role?: string;
  as_role?: string;
  targetRole?: string;
  senderRole?: string;
  in_forum?: string;
  topic?: string;
  patch?: any;
  on_accept?: (res: any) => CuratorAstNode | void;
  on_reject?: (res: any) => CuratorAstNode | void;
  [k: string]: any;
}

export interface InformOptions {
  to?: string;
  role?: string;
  to_role?: string;
  as_role?: string;
  targetRole?: string;
  senderRole?: string;
  topic?: string;
  payload: any;
  [k: string]: any;
}

export interface VoteOptions {
  in_forum: string;
  ballot: VoteChoice;
  as_role?: string;
  senderRole?: string;
  rationale?: string;
  [k: string]: any;
}

export interface SynthesizeOptions {
  in_forum: string;
  conclusion: string;
  summary?: string;
  as_role?: string;
  senderRole?: string;
  [k: string]: any;
}

export interface BroadcastOptions {
  topic: string;
  as_role?: string;
  to_role?: string;
  senderRole?: string;
  targetRole?: string;
  [k: string]: any;
}

export interface GrantLeaseActOptions {
  to: string;
  tool: string;
  duration?: string | number;
  maxInvocations?: number;
  conversationId?: string;
}

export interface RevokeLeaseActOptions {
  to?: string;
  tool?: string;
  leaseId?: string;
  conversationId?: string;
}
