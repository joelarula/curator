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

/** Records an invitation (or keeps the open one). */
export async function addInvitation(prisma: any, conversationId: number, invitee: ConversationMemberRef, inviter: ConversationMemberRef): Promise<any> {
  const where = { conversationId, inviteeType: invitee.memberType, inviteeId: invitee.memberId, existent: true };
  const open = await prisma.conversationInvitation.findFirst({ where });
  if (open) return open;
  return prisma.conversationInvitation.create({
    data: { conversationId, inviteeType: invitee.memberType, inviteeId: invitee.memberId, invitedByType: inviter.memberType, invitedById: inviter.memberId },
  });
}

/** Whether a member has an open invitation to the conversation. */
export async function isInvited(prisma: any, conversationId: number, member: ConversationMemberRef): Promise<boolean> {
  if (!prisma?.conversationInvitation) return false;
  const row = await prisma.conversationInvitation.findFirst({
    where: { conversationId, inviteeType: member.memberType, inviteeId: member.memberId, existent: true },
    select: { id: true },
  });
  return !!row;
}

/** Joining accepts an open invitation (kept as history). */
export async function acceptInvitation(prisma: any, conversationId: number, member: ConversationMemberRef): Promise<boolean> {
  if (!prisma?.conversationInvitation) return false;
  const { count } = await prisma.conversationInvitation.updateMany({
    where: { conversationId, inviteeType: member.memberType, inviteeId: member.memberId, existent: true },
    data: { existent: null, acceptedAt: new Date() },
  });
  return count > 0;
}

/** Whether a member currently belongs to the conversation. */
export async function isMember(prisma: any, conversationId: number, member: ConversationMemberRef): Promise<boolean> {
  if (!prisma?.conversationMember) return false;
  const row = await prisma.conversationMember.findFirst({ where: { conversationId, ...member, existent: true }, select: { id: true } });
  return !!row;
}

/** Prisma `where` on Conversation: the user's current memberships. */
export const memberOfWhere = (userId: string) => ({ members: { some: { memberType: 'user', memberId: userId, existent: true } } });
