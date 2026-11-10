/**
 * Channel membership (ConversationMember): a conversation with members is a channel. Members are added and removed
 * only by the join / leave steps of the conversation's workflow (`conversation_join` / `conversation_leave` run from
 * an AST); people and the console send `conversation:join_requested` / `conversation:leave_requested` instead.
 */

export type MemberType = 'user' | 'agent';

export interface ConversationMemberRef {
  memberType: MemberType;
  memberId: string;
}

/** True unless the tool is called directly (console, CLI, GraphQL, MCP): those runs carry `literalArgs`. */
export function isWorkflowCall(ctx: Record<string, any>): boolean {
  return ctx?.context?.literalArgs !== true;
}

/**
 * Who a join / leave step is about: the named agent, else whoever sent the event the workflow handles
 * (`context.emittedBy`, set by the engine), else the calling user or agent.
 */
export function memberOf(ctx: Record<string, any>, agentId?: string | null): ConversationMemberRef | null {
  if (agentId) return { memberType: 'agent', memberId: String(agentId) };
  const by = ctx?.context?.emittedBy;
  if (by?.agentId) return { memberType: 'agent', memberId: String(by.agentId) };
  if (by?.userId) return { memberType: 'user', memberId: String(by.userId) };
  if (ctx?.agentId) return { memberType: 'agent', memberId: String(ctx.agentId) };
  if (ctx?.userId) return { memberType: 'user', memberId: String(ctx.userId) };
  return null;
}

/** The live-session participant id of a member (sessions are keyed by agent ids). */
export const participantId = (m: ConversationMemberRef): string => (m.memberType === 'agent' ? m.memberId : `user:${m.memberId}`);

/**
 * The stored Conversation for a conversation id (numeric id or externalId), or null when it is not in the database
 * (in-memory rooms) or belongs to another project than `projectId`.
 */
export async function findConversationRow(prisma: any, conversationId: string | number | null | undefined, projectId?: string | null): Promise<any | null> {
  if (!prisma?.conversation || conversationId == null || conversationId === '') return null;
  const asNumber = Number(conversationId);
  const where = Number.isInteger(asNumber) && String(asNumber) === String(conversationId) ? { id: asNumber } : { externalId: String(conversationId) };
  const row = await prisma.conversation.findFirst({ where: { ...where, existent: true } });
  if (!row) return null;
  if (projectId && row.projectId && String(row.projectId) !== String(projectId)) return null;
  return row;
}

/** Records a member (or updates its conversational role). */
export async function addMember(prisma: any, conversationId: number, member: ConversationMemberRef, conversationalRole?: string | null): Promise<any> {
  const current = await prisma.conversationMember.findFirst({ where: { conversationId, ...member, existent: true } });
  if (current) {
    return conversationalRole && conversationalRole !== current.conversationalRole
      ? prisma.conversationMember.update({ where: { id: current.id }, data: { conversationalRole } })
      : current;
  }
  return prisma.conversationMember.create({ data: { conversationId, ...member, conversationalRole: conversationalRole ?? null } });
}

/** Ends a membership (kept as history). Returns whether the member was in. */
export async function removeMember(prisma: any, conversationId: number, member: ConversationMemberRef): Promise<boolean> {
  const { count } = await prisma.conversationMember.updateMany({
    where: { conversationId, ...member, existent: true },
    data: { existent: null, leftAt: new Date() },
  });
  return count > 0;
}

/** Prisma `where` on Conversation: the user's current memberships. */
export const memberOfWhere = (userId: string) => ({ members: { some: { memberType: 'user', memberId: userId, existent: true } } });
