import type {
  AgentMessageEnvelope,
  CreateAgentEnvelopeOptions,
  SpeechAct,
  ConversationType,
  AgentEndpoint,
} from './types.js';

const VALID_SPEECH_ACTS: Set<SpeechAct> = new Set([
  'INFORM',
  'QUERY',
  'REQUEST',
  'PROPOSE',
  'ACCEPT',
  'REJECT',
  'VOTE',
  'SYNTHESIZE',
  'ACK',
  'JOIN',
  'LEAVE',
  'HEARTBEAT',
  'SYNC',
]);

const VALID_CONVERSATION_TYPES: Set<ConversationType> = new Set([
  'dialog',
  'monolog',
  'forum',
  'qa',
]);

/**
 * Creates a validated, standardized AgentMessageEnvelope with defaults.
 */
export function createAgentMessageEnvelope<T = any>(
  options: CreateAgentEnvelopeOptions<T>
): AgentMessageEnvelope<T> {
  const now = new Date();
  const timestamp = now.toISOString();
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  let expiresAt: string | undefined;
  if (options.expiresInMs && options.expiresInMs > 0) {
    expiresAt = new Date(now.getTime() + options.expiresInMs).toISOString();
  }

  let recipients: AgentEndpoint[] | '*' = '*';
  if (options.recipients && options.recipients !== '*') {
    recipients = options.recipients.map((r) => ({
      ...r,
      nodeId: r.nodeId || 'local',
      agentId: r.agentId || (r.role ? `@role:${r.role}` : 'anonymous'),
    }));
  }

  const envelope: AgentMessageEnvelope<T> = {
    messageId,
    conversationId: options.conversationId,
    threadId: options.threadId,
    correlationId: options.correlationId,
    parentMessageId: options.parentMessageId,
    sender: {
      ...options.sender,
      nodeId: options.sender.nodeId || 'local',
      agentId: options.sender.agentId || (options.sender.role ? `@role:${options.sender.role}` : 'anonymous'),
    },
    recipients,
    conversationType: options.conversationType,
    communicationForm: options.communicationForm,
    turnDynamics: options.turnDynamics,
    intent: options.intent,
    speechAct: options.speechAct,
    topic: options.topic,
    summary: options.summary,
    payload: options.payload,
    turn: options.turn ?? 1,
    contextState: options.contextState,
    timestamp,
    expiresAt,
    hops: 0,
    maxHops: options.maxHops ?? 5,
  };

  return envelope;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an incoming or outgoing AgentMessageEnvelope.
 */
export function validateAgentMessageEnvelope(envelope: any): ValidationResult {
  const errors: string[] = [];

  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, errors: ['Envelope must be a non-null object'] };
  }

  // Required string fields
  if (!envelope.messageId || typeof envelope.messageId !== 'string') {
    errors.push('Missing or invalid "messageId"');
  }
  if (!envelope.conversationId || typeof envelope.conversationId !== 'string') {
    errors.push('Missing or invalid "conversationId"');
  }
  if (!envelope.timestamp || typeof envelope.timestamp !== 'string') {
    errors.push('Missing or invalid "timestamp"');
  }

  // Enum validations
  if (!envelope.conversationType || !VALID_CONVERSATION_TYPES.has(envelope.conversationType)) {
    errors.push(
      `Invalid "conversationType": expected one of ${Array.from(VALID_CONVERSATION_TYPES).join(', ')}`
    );
  }
  if (!envelope.speechAct || !VALID_SPEECH_ACTS.has(envelope.speechAct)) {
    errors.push(
      `Invalid "speechAct": expected one of ${Array.from(VALID_SPEECH_ACTS).join(', ')}`
    );
  }

  // Sender validation
  if (!envelope.sender || typeof envelope.sender !== 'object') {
    errors.push('Missing or invalid "sender"');
  } else {
    if ((!envelope.sender.agentId || typeof envelope.sender.agentId !== 'string') && !envelope.sender.role) {
      errors.push('Missing or invalid "sender.agentId" or "sender.role"');
    }
  }

  // Recipients validation: '*' or non-empty array of endpoints
  if (envelope.recipients !== '*') {
    if (!Array.isArray(envelope.recipients) || envelope.recipients.length === 0) {
      errors.push('"recipients" must be "*" or a non-empty array of AgentEndpoint objects');
    } else {
      for (let i = 0; i < envelope.recipients.length; i++) {
        const r = envelope.recipients[i];
        if (!r || typeof r !== 'object' || (!r.agentId && !r.role)) {
          errors.push(`Invalid recipient at index ${i}: must have an "agentId" or "role"`);
        }
      }
    }
  }

  // Turn index validation (must be positive integer)
  if (typeof envelope.turn !== 'number' || envelope.turn < 1) {
    errors.push('"turn" must be a positive integer >= 1');
  }

  // Hop limit validation
  if (typeof envelope.hops === 'number' && typeof envelope.maxHops === 'number') {
    if (envelope.hops > envelope.maxHops) {
      errors.push(`Envelope hops (${envelope.hops}) exceeded maxHops (${envelope.maxHops})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Type guard for AgentMessageEnvelope.
 */
export function isAgentMessageEnvelope(obj: any): obj is AgentMessageEnvelope {
  return validateAgentMessageEnvelope(obj).valid;
}
