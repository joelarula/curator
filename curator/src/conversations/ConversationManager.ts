import type { AgentMessageEnvelope, ConversationRoomMetadata } from './types.js';
import { appendStatePatch } from '../engine/ConversationStateLog.js';

export interface ConversationManagerConfig {
  prisma: any;
  defaultProjectId?: string;
  defaultUserId?: string;
}

export class ConversationManager {
  private prisma: any;
  private defaultProjectId: string;
  private defaultUserId: string;

  constructor(config: ConversationManagerConfig) {
    this.prisma = config.prisma;
    this.defaultProjectId = config.defaultProjectId || '1';
    this.defaultUserId = config.defaultUserId || '1';
  }

  /**
   * Upserts or finds the database Conversation entity corresponding to the envelope's conversationId.
   * Maintains room metadata, participant roster, and governance state.
   */
  public async findOrCreateRoom(
    envelope: AgentMessageEnvelope,
    options: { projectId?: string; userId?: string } = {}
  ): Promise<any> {
    const projectId = options.projectId || this.defaultProjectId;
    const userId = options.userId || this.defaultUserId;
    const externalId = envelope.conversationId;

    const existing = await this.prisma.conversation.findUnique({
      where: { externalId },
    });

    const senderProject = envelope.sender.projectId || projectId;

    if (existing) {
      // Update room metadata with active participants, participating projects, and turn
      const currentMeta: ConversationRoomMetadata = typeof existing.metadata === 'string'
        ? JSON.parse(existing.metadata)
        : (existing.metadata || {});

      const participants = currentMeta.participants || [];
      const hasSender = participants.some(
        p => p.nodeId === envelope.sender.nodeId && p.agentId === envelope.sender.agentId
      );

      if (!hasSender) {
        participants.push(envelope.sender);
      }

      // Aggregate participating projects
      const projectSet = new Set<string>(currentMeta.participatingProjects || [existing.projectId || projectId]);
      if (envelope.sender.projectId) projectSet.add(envelope.sender.projectId);
      if (Array.isArray(envelope.recipients)) {
        for (const r of envelope.recipients) {
          if (r.projectId) projectSet.add(r.projectId);
        }
      }

      const updatedMeta: ConversationRoomMetadata = {
        ...currentMeta,
        conversationType: envelope.conversationType,
        roomUri: currentMeta.roomUri || `curator://${envelope.sender.nodeId}/rooms/${externalId}`,
        topic: envelope.topic || currentMeta.topic,
        participants,
        participatingProjects: Array.from(projectSet),
        governance: {
          mode: currentMeta.governance?.mode || 'round-robin',
          activeSpeaker: `${envelope.sender.nodeId}:${envelope.sender.agentId}`,
          currentTurn: envelope.turn,
          maxTurns: currentMeta.governance?.maxTurns,
        },
        customState: {
          ...(currentMeta.customState || {}),
          ...(envelope.contextState || {}),
          lastSpeechAct: envelope.speechAct,
          lastMessageId: envelope.messageId,
          lastUpdatedAt: envelope.timestamp,
        },
      };

      await appendStatePatch(this.prisma, existing.id, { set: updatedMeta as Record<string, any> });
      return this.prisma.conversation.findUnique({ where: { id: existing.id } });
    }

    // Aggregate participating projects for new room
    const initialProjects = new Set<string>([projectId, senderProject]);
    if (Array.isArray(envelope.recipients)) {
      for (const r of envelope.recipients) {
        if (r.projectId) initialProjects.add(r.projectId);
      }
    }

    // Create new Conversation record
    const initialMeta: ConversationRoomMetadata = {
      conversationType: envelope.conversationType,
      roomUri: `curator://${envelope.sender.nodeId}/rooms/${externalId}`,
      topic: envelope.topic,
      participants: [envelope.sender],
      participatingProjects: Array.from(initialProjects),
      governance: {
        mode: envelope.conversationType === 'dialog' ? 'round-robin' : 'free-floor',
        activeSpeaker: `${envelope.sender.nodeId}:${envelope.sender.agentId}`,
        currentTurn: envelope.turn,
      },
      customState: {
        ...(envelope.contextState || {}),
        lastSpeechAct: envelope.speechAct,
        lastMessageId: envelope.messageId,
        startedAt: envelope.timestamp,
      },
    };

    const created = await this.prisma.conversation.create({
      data: {
        externalId,
        userId,
        projectId,
      },
    });
    await appendStatePatch(this.prisma, created.id, { set: initialMeta as Record<string, any> });
    return this.prisma.conversation.findUnique({ where: { id: created.id } });
  }

  /**
   * Persists an immutable Response record for the processed conversational turn.
   */
  public async recordTurn(
    conversation: any,
    envelope: AgentMessageEnvelope,
    options: { requestId?: number; content?: string } = {}
  ): Promise<any> {
    const payloadContent = options.content || JSON.stringify({
      messageId: envelope.messageId,
      speechAct: envelope.speechAct,
      sender: envelope.sender,
      turn: envelope.turn,
      topic: envelope.topic,
      payload: envelope.payload,
      timestamp: envelope.timestamp,
    });

    return this.prisma.response.create({
      data: {
        conversationId: conversation.id,
        requestId: options.requestId || 0,
        projectId: conversation.projectId || this.defaultProjectId,
        content: payloadContent,
      },
    });
  }

  /**
   * Updates state variables in Conversation metadata to guarantee AST turn persistence (AGENTS.md §4.5).
   */
  public async syncContextState(
    conversationId: number,
    stateUpdates: Record<string, unknown>
  ): Promise<any> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conv) {
      throw new Error(`Conversation not found for ID: ${conversationId}`);
    }

    const currentMeta: Record<string, any> = typeof conv.metadata === 'string'
      ? JSON.parse(conv.metadata)
      : (conv.metadata || {});

    const customState = {
      ...(currentMeta.customState || {}),
      ...stateUpdates,
    };

    await appendStatePatch(this.prisma, conversationId, { set: { customState } });
    return this.prisma.conversation.findUnique({ where: { id: conversationId } });
  }

  /**
   * Creates an execution task (Request) in the database for the receiving agent.
   */
  public async createTurnRequest(
    conversation: any,
    envelope: AgentMessageEnvelope,
    ast: any,
    options: { agentId?: string; userId?: string } = {}
  ): Promise<any> {
    return this.prisma.request.create({
      data: {
        conversationId: conversation.id,
        projectId: conversation.projectId || this.defaultProjectId,
        userId: options.userId || conversation.userId || this.defaultUserId,
        agentId: options.agentId,
        status: 'NEW',
        ast,
        context: envelope.contextState || {},
      },
    });
  }
}
