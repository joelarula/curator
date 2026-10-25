import type { CuratorHost } from '../types.js';

export interface WaitingChoiceInfo {
  requestId: number;
  conversationId: number;
  prompt?: string;
  choices: any[];
  context: Record<string, any>;
  waitEvent?: string;
}

export interface ConversationStepResult {
  done: boolean;
  waiting: boolean;
  steps: number;
  waitingChoice: WaitingChoiceInfo | null;
  context: Record<string, any> | null;
}

export interface SessionActor {
  id: string;
  kind: 'user' | 'agent';
  name: string;
  roles: string[];
  isHuman: boolean;
  persona?: string;
  instruction?: string;
  capabilities: string[];
}

/**
 * Checks if a conversation has a pending interactive request (e.g. choice node or waiting for user event).
 */
export async function getWaitingChoice(
  prisma: any,
  conversationId: number
): Promise<WaitingChoiceInfo | null> {
  const waitingReq = await prisma.request.findFirst({
    where: {
      conversationId,
      status: { in: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER'] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!waitingReq) return null;
  const ctx = (waitingReq.context as any) || {};
  const ast = waitingReq.ast as any;
  const isInteractiveWait =
    ctx.waitEvent === 'curator:choice' ||
    ctx.waitEvent === 'poker:human_action' ||
    ast?.type === 'Curator_HumanInput';

  if (!isInteractiveWait && waitingReq.status !== 'WAITING_FOR_USER') return null;

  const choices = ctx.activeChoices || ctx.choices || [];
  return {
    requestId: waitingReq.id,
    conversationId,
    prompt: ctx.prompt || (Array.isArray(choices) ? undefined : choices?.prompt),
    choices: Array.isArray(choices) ? choices : (choices?.choices || []),
    context: ctx,
    waitEvent: ctx.waitEvent,
  };
}

/**
 * Steps a conversation's requests forward in the processor until an interactive gate or completion.
 */
export async function stepInteractiveConversation(
  host: CuratorHost,
  conversationId: number,
  maxSteps: number = 500
): Promise<ConversationStepResult> {
  const stepRes = await host.processor.stepUntil({
    conversationId,
    maxSteps,
  });

  const waitingChoice = await getWaitingChoice(host.prisma, conversationId);
  const latestReq = await host.prisma.request.findFirst({
    where: { conversationId },
    orderBy: { updatedAt: 'desc' },
    select: { context: true },
  });

  return {
    done: stepRes.done,
    waiting: stepRes.waiting || waitingChoice !== null,
    steps: stepRes.steps,
    waitingChoice,
    context: (latestReq?.context as any) || null,
  };
}

/**
 * Resolves all DB agents and user actors registered for a conversation under the project scope.
 */
export async function resolveSessionActors(
  host: CuratorHost,
  conversationId: number
): Promise<SessionActor[]> {
  const prisma = host.prisma;
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { user: true },
  });

  const user = conv?.user || host.user;
  const projectId = conv?.projectId || host.project?.id;

  const actors: SessionActor[] = [
    {
      id: user?.id || 'hero',
      kind: 'user',
      name: user?.name || 'User',
      roles: ['player', 'spectator'],
      isHuman: true,
      persona: 'human',
      capabilities: ['table_action', 'TABLE_TALK', 'WHISPER', 'BANTER'],
    },
  ];

  let dbAgents: any[] = [];
  try {
    dbAgents = await prisma.agent.findMany({
      where: { OR: [{ projectId }, { existent: true }] },
      include: {
        roles: { include: { role: true } },
      },
      orderBy: { id: 'asc' },
    });
  } catch (_) {}

  for (const agent of dbAgents) {
    if (agent.id === user?.id) continue;
    const roleNames = agent.roles?.map((r: any) => r.role?.name || r.roleId) || [];
    actors.push({
      id: agent.id,
      kind: 'agent',
      name: agent.name,
      roles: roleNames,
      isHuman: false,
      capabilities: ['TABLE_TALK', 'WHISPER', 'BANTER'],
    });
  }

  return actors;
}
