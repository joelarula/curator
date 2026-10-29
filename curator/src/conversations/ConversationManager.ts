import type { AgentMessageEnvelope, ConversationRoomMetadata } from './types.js';
import { appendStatePatch } from '../engine/ConversationStateLog.js';
import { createInitialRoomMetadata, reduceRoomTurn } from './ConversationTools.js';

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
   * Uses pure deterministic reducers (createInitialRoomMetadata / reduceRoomTurn) and persists via appendStatePatch.
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

    if (existing) {
      const currentMeta: ConversationRoomMetadata = typeof existing.metadata === 'string'
        ? JSON.parse(existing.metadata)
        : (existing.metadata || {});

      const { metadata: updatedMeta } = reduceRoomTurn(
        {
          ...currentMeta,
          roomUri: currentMeta.roomUri || `curator://${envelope.sender.nodeId}/rooms/${externalId}`,
          participatingProjects: currentMeta.participatingProjects || [existing.projectId || projectId],
        },
        envelope
      );

      await appendStatePatch(this.prisma, existing.id, { set: updatedMeta as Record<string, any> });
      return this.prisma.conversation.findUnique({ where: { id: existing.id } });
    }

    const baseMeta = createInitialRoomMetadata(
      {
        conversationId: externalId,
        conversationType: envelope.conversationType,
        roomUri: `curator://${envelope.sender.nodeId}/rooms/${externalId}`,
        topic: envelope.topic,
        initialParticipants: [envelope.sender],
        governanceMode: envelope.conversationType === 'dialog' ? 'round-robin' : 'free-floor',
        projectId,
      },
      envelope.sender.nodeId,
      projectId
    );

    const { metadata: initialMeta } = reduceRoomTurn(baseMeta, envelope);
    initialMeta.customState = {
      ...initialMeta.customState,
      startedAt: envelope.timestamp,
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
   * Persists a conversational turn into EventLog (for DB-driven AST & LLM folding)
   * and Response (when available).
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

    if (this.prisma.eventLog?.create) {
      const target = Array.isArray(envelope.recipients) && envelope.recipients.length === 1
        ? envelope.recipients[0].agentId
        : undefined;
      try {
        await this.prisma.eventLog.create({
          data: {
            conversationId: conversation.id,
            eventName: 'agent:message',
            target,
            payload: {
              from: envelope.sender.agentId,
              speechAct: envelope.speechAct,
              text: typeof envelope.payload === 'string'
                ? envelope.payload
                : (envelope.payload?.text ?? envelope.payload?.utterance ?? envelope.payload?.message ?? payloadContent),
              envelope,
            },
          },
        });
      } catch {
        // Non-blocking if EventLog table differs in mock
      }
    }

    if (this.prisma.response?.create) {
      try {
        return await this.prisma.response.create({
          data: {
            conversationId: conversation.id,
            requestId: options.requestId || 0,
            projectId: conversation.projectId || this.defaultProjectId,
            content: payloadContent,
          },
        });
      } catch {
        // Fallback when foreign-key constraints reject requestId: 0 without an active Request row
      }
    }
    return null;
  }

  /**
   * Updates state variables in Conversation metadata to guarantee AST turn persistence.
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
