import { EventEmitter } from 'events';
import { appendStatePatch } from '../engine/ConversationStateLog.js';
import {
  ConversationContextBuilder,
  type ConversationContext,
  type ConversationEntry,
} from '../engine/llm/ConversationContext.js';
import type { ILlmProvider } from '../engine/llm/ILlmProvider.js';

export interface InteractionEvent {
  id: string;
  timestamp: number;
  type: 'GAME_MOVE' | 'SPEECH_ACT' | 'FRAME_EVENT' | 'REVELATION';
  actorId: string;
  actorName: string;
  action: string;
  payload?: any;
  speechAct?: string;
  recipientId?: string;
  isPrivate?: boolean;
  authorizedParticipantIds?: string[];
  summary: string;
}

export interface AgentParticipantProfile {
  id: string;
  name: string;
  role: string;
  personaPrompt?: string;
  isHuman?: boolean;
  lexiconTags?: string[];
}

export interface AgentWorkingMemory {
  participant: AgentParticipantProfile;
  privateState: Record<string, any>;
  innerMonologue: string;
  storyLog: string[];
  peerModels?: Record<string, Record<string, any>>;
  epistemicState?: Record<string, any>;
}

export interface InteractionCheckpoint {
  id: string;
  conversationId: string;
  epochId?: string;
  timestamp: number;
  participants: AgentParticipantProfile[];
  memories: Record<
    string,
    {
      privateState: Record<string, any>;
      innerMonologue: string;
      recentStoryLog: string[];
      peerModels?: Record<string, Record<string, any>>;
      epistemicState?: Record<string, any>;
    }
  >;
  stateSnapshot?: Record<string, any>;
}

export interface AgentProjectedState {
  agentId: string;
  name: string;
  role: string;
  isHuman: boolean;
  innerMonologue: string;
  recentStoryLog: string[];
  privateState: Record<string, any>;
  peerModels?: Record<string, Record<string, any>>;
  publicGameStateSummary?: string;
}

export interface AgentInteractionContextOptions {
  conversationId: string;
  prisma?: any;
  llmProvider?: ILlmProvider;
  maxStoryLogEntries?: number;
  autoCompactThreshold?: number;
  maxEventLogEntries?: number;
  promptHistoryWindow?: number;
}

export interface LlmContextBundle {
  agentId: string;
  agentName: string;
  systemInstruction: string;
  userPrompt: string;
  subjectiveMemoryLog: string[];
  privateState: Record<string, any>;
}

export interface AgentReactionResult {
  speakerId: string;
  speakerName: string;
  speechAct?: string;
  recipientId?: string;
  text: string;
  innerMonologue: string;
}

const ANSI_PALETTE = ['\x1b[35m', '\x1b[33m', '\x1b[36m', '\x1b[34m'];

/**
 * AgentInteractionContextManager
 *
 * Models and manages consecutive domain moves and speech acts,
 * synthesizing subjective working memories and audience-filtered context streams per participant.
 * Bridges with the engine's ConversationContextBuilder & ConversationStateLog.
 */
export class AgentInteractionContextManager extends EventEmitter {
  public readonly conversationId: string;
  private memories: Map<string, AgentWorkingMemory> = new Map();
  private eventLog: InteractionEvent[] = [];
  private prisma?: any;
  private llmProvider?: ILlmProvider;

  public readonly maxStoryLogEntries: number;
  public readonly autoCompactThreshold: number;
  public readonly maxEventLogEntries: number;
  public readonly promptHistoryWindow: number;
  private currentEpochId?: string;
  private checkpoints: Map<string, InteractionCheckpoint> = new Map();
  private latestCheckpoint?: InteractionCheckpoint;

  constructor(options: AgentInteractionContextOptions) {
    super();
    this.conversationId = options.conversationId;
    this.prisma = options.prisma;
    this.llmProvider = options.llmProvider;
    this.maxStoryLogEntries = options.maxStoryLogEntries ?? 25;
    this.autoCompactThreshold = options.autoCompactThreshold ?? 35;
    this.maxEventLogEntries = options.maxEventLogEntries ?? 50;
    this.promptHistoryWindow = options.promptHistoryWindow ?? 12;
  }

  public compactAgentStoryLog(agentId: string): void {
    const mem = this.memories.get(agentId);
    if (!mem || mem.storyLog.length <= this.maxStoryLogEntries) return;

    const pruneCount = mem.storyLog.length - this.maxStoryLogEntries;
    const oldEntries = mem.storyLog.slice(0, pruneCount);
    const summaryTag = `[SUMMARY of ${oldEntries.length} prior actions in ${this.currentEpochId || 'previous turns'}]`;
    mem.storyLog = [summaryTag, ...mem.storyLog.slice(pruneCount)];
    this.emit('memory:compacted', { agentId, prunedCount: oldEntries.length });
  }

  public startEpoch(
    epochId: string,
    metadata?: { description?: string; resetPrivateState?: boolean; details?: any }
  ): void {
    this.currentEpochId = epochId;
    const desc = metadata?.description ? `: ${metadata.description}` : '';
    const marker = `=== EPOCH ${epochId}${desc} ===`;

    for (const [id, mem] of this.memories.entries()) {
      if (metadata?.resetPrivateState) {
        mem.privateState = {};
      }
      mem.storyLog.push(marker);
      if (mem.storyLog.length > this.autoCompactThreshold) {
        this.compactAgentStoryLog(id);
      }
    }

    this.emit('epoch:started', { epochId, metadata });
  }

  public getCurrentEpoch(): string | undefined {
    return this.currentEpochId;
  }

  public createCheckpoint(stateSnapshot?: Record<string, any>): InteractionCheckpoint {
    const id = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const participants = Array.from(this.memories.values()).map((m) => ({ ...m.participant }));
    const memoriesSnapshot: Record<string, any> = {};

    for (const [agentId, mem] of this.memories.entries()) {
      memoriesSnapshot[agentId] = {
        privateState: { ...mem.privateState },
        innerMonologue: mem.innerMonologue,
        recentStoryLog: mem.storyLog.slice(-this.maxStoryLogEntries),
        peerModels: mem.peerModels ? structuredClone(mem.peerModels) : {},
        epistemicState: mem.epistemicState ? structuredClone(mem.epistemicState) : {},
      };
    }

    const checkpoint: InteractionCheckpoint = {
      id,
      conversationId: this.conversationId,
      epochId: this.currentEpochId,
      timestamp: Date.now(),
      participants,
      memories: memoriesSnapshot,
      stateSnapshot: stateSnapshot ? structuredClone(stateSnapshot) : undefined,
    };

    this.checkpoints.set(id, checkpoint);
    this.latestCheckpoint = checkpoint;
    this.emit('checkpoint:created', checkpoint);

    if (this.prisma?.conversation?.update) {
      this.persistCheckpoint(checkpoint).catch(() => {});
    }

    return checkpoint;
  }

  public getCheckpoint(id: string): InteractionCheckpoint | undefined {
    return this.checkpoints.get(id);
  }

  public getLatestCheckpoint(): InteractionCheckpoint | undefined {
    return this.latestCheckpoint;
  }

  public getAllCheckpoints(): InteractionCheckpoint[] {
    return Array.from(this.checkpoints.values());
  }

  public async persistCheckpoint(checkpoint?: InteractionCheckpoint): Promise<void> {
    const cp = checkpoint || this.latestCheckpoint;
    if (!cp || !this.prisma?.conversation) return;

    try {
      const convIdNum = parseInt(this.conversationId, 10);
      const where = !isNaN(convIdNum) ? { id: convIdNum } : { externalId: this.conversationId };
      const current = await this.prisma.conversation.findUnique({ where });
      if (!current) return;
      await appendStatePatch(this.prisma, current.id, { set: { lastCheckpoint: cp } });
      this.emit('checkpoint:persisted', { checkpointId: cp.id });
    } catch {
      // Non-blocking persistence
    }
  }

  public restoreFromCheckpoint(checkpoint: InteractionCheckpoint): void {
    this.currentEpochId = checkpoint.epochId;
    for (const p of checkpoint.participants) {
      this.registerParticipant(p);
    }
    for (const [agentId, saved] of Object.entries(checkpoint.memories)) {
      const mem = this.memories.get(agentId);
      if (mem) {
        mem.privateState = { ...saved.privateState };
        mem.innerMonologue = saved.innerMonologue;
        mem.storyLog = [...saved.recentStoryLog];
        mem.peerModels = saved.peerModels ? { ...saved.peerModels } : {};
        mem.epistemicState = saved.epistemicState ? { ...saved.epistemicState } : {};
      }
    }
    this.emit('checkpoint:restored', { checkpointId: checkpoint.id });
  }

  public getProjectedState(agentId: string, publicGameStateSummary?: string): AgentProjectedState | null {
    const mem = this.memories.get(agentId);
    if (!mem) return null;

    return {
      agentId,
      name: mem.participant.name,
      role: mem.participant.role,
      isHuman: !!mem.participant.isHuman,
      innerMonologue: mem.innerMonologue,
      recentStoryLog: mem.storyLog.slice(-this.promptHistoryWindow),
      privateState: { ...mem.privateState },
      peerModels: mem.peerModels ? { ...mem.peerModels } : undefined,
      publicGameStateSummary,
    };
  }

  /**
   * Projects recorded interaction events into the engine's standard ConversationContext
   * for a specific viewer, enforcing audience visibility for private moves and whispers.
   */
  public toConversationContext(agentId: string): ConversationContext | null {
    const mem = this.memories.get(agentId);
    if (!mem) return null;

    const entries: ConversationEntry[] = this.eventLog.map((evt) => {
      const mode = evt.type === 'SPEECH_ACT' && evt.isPrivate ? 'whisper' : 'say';
      const audience = evt.isPrivate && evt.authorizedParticipantIds
        ? evt.authorizedParticipantIds
        : 'all';
      return {
        id: evt.id,
        at: evt.timestamp,
        speaker: evt.actorId,
        mode,
        text: evt.summary,
        audience,
      };
    });

    return new ConversationContextBuilder({
      system: mem.participant.personaPrompt,
      limit: this.promptHistoryWindow,
      label: (speakerId) => this.memories.get(speakerId)?.participant.name || speakerId,
    })
      .pushAll(entries)
      .build(agentId);
  }

  public registerParticipant(profile: AgentParticipantProfile): void {
    if (!this.memories.has(profile.id)) {
      this.memories.set(profile.id, {
        participant: profile,
        privateState: {},
        innerMonologue: profile.isHuman
          ? 'Connected to session. Ready to participate.'
          : `Entering the frame as ${profile.name}. Assessing dynamics.`,
        storyLog: [`Joined session ${this.conversationId} as ${profile.name} (${profile.role}).`],
        peerModels: {},
        epistemicState: {},
      });
    }
  }

  public setPrivateState(agentId: string, state: Record<string, any>): void {
    const mem = this.memories.get(agentId);
    if (mem) {
      mem.privateState = { ...mem.privateState, ...state };
    }
  }

  public recordGameMove(options: {
    actorId: string;
    action: string;
    summary: string;
    details?: any;
    isPrivate?: boolean;
    privateTo?: string[];
  }): void {
    const actorMem = this.memories.get(options.actorId);
    const actorName = actorMem ? actorMem.participant.name : options.actorId;

    const event: InteractionEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      type: 'GAME_MOVE',
      actorId: options.actorId,
      actorName,
      action: options.action,
      payload: options.details,
      isPrivate: options.isPrivate || false,
      authorizedParticipantIds: options.privateTo,
      summary: options.summary,
    };

    this.pushEvent(event);

    for (const [id, mem] of this.memories.entries()) {
      if (options.isPrivate && options.privateTo && !options.privateTo.includes(id)) {
        continue;
      }

      const line = id === options.actorId
        ? `I executed move [${options.action}]: ${options.summary}`
        : `Observed ${actorName} execute [${options.action}]: ${options.summary}`;
      this.appendStoryLine(id, mem, line);
    }

    this.emit('event:game_move', event);
  }

  public recordSpeech(options: {
    speakerId: string;
    text: string;
    speechAct?: string;
    recipientId?: string;
  }): void {
    const speakerMem = this.memories.get(options.speakerId);
    const speakerName = speakerMem ? speakerMem.participant.name : options.speakerId;
    const isWhisper = options.speechAct === 'WHISPER' || Boolean(options.recipientId);
    const recipientMem = options.recipientId ? this.memories.get(options.recipientId) : undefined;
    const recipientName = recipientMem ? recipientMem.participant.name : options.recipientId;
    const act = options.speechAct || (isWhisper ? 'WHISPER' : 'SPEECH');

    const event: InteractionEvent = {
      id: `spk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      type: 'SPEECH_ACT',
      actorId: options.speakerId,
      actorName: speakerName,
      action: act,
      speechAct: act,
      recipientId: options.recipientId,
      isPrivate: isWhisper,
      authorizedParticipantIds: isWhisper && options.recipientId ? [options.speakerId, options.recipientId] : undefined,
      summary: `${speakerName} spoke: "${options.text}"`,
    };

    this.pushEvent(event);

    for (const [id, mem] of this.memories.entries()) {
      let line: string;
      if (isWhisper) {
        if (id === options.speakerId) {
          line = `[WHISPER to ${recipientName || 'someone'}]: "${options.text}"`;
        } else if (id === options.recipientId) {
          line = `[WHISPER from ${speakerName}]: "${options.text}"`;
          mem.innerMonologue = `${speakerName} whispered privately to me. Evaluating intent.`;
        } else {
          line = `[OBSERVED]: ${speakerName} whispered secretly to ${recipientName || 'another participant'}.`;
        }
      } else {
        line = id === options.speakerId
          ? `[SPOKE to table (${options.speechAct})]: "${options.text}"`
          : `[${speakerName} (${options.speechAct})]: "${options.text}"`;
      }
      this.appendStoryLine(id, mem, line);
    }

    this.emit('event:speech_act', event);
  }

  public recordSpeechAct(options: {
    speakerId: string;
    text: string;
    speechAct?: string;
    recipientId?: string;
  }): void {
    this.recordSpeech(options);
  }

  public buildAgentLlmContext(
    agentId: string,
    situation: {
      gameStateSummary: string;
      currentPrompt: string;
    }
  ): LlmContextBundle | null {
    const mem = this.memories.get(agentId);
    if (!mem) return null;

    const systemInstruction = `${mem.participant.personaPrompt || `You are ${mem.participant.name}, a strategic participant.`}
You are participating in an interactive session.
You have private memory and subjective observations of everything that has occurred.
Keep your identity and private state protected unless revealed.`;

    const recentHistory = mem.storyLog.slice(-this.promptHistoryWindow).join('\n');
    const privateStateStr = JSON.stringify(mem.privateState);

    const userPrompt = `=== YOUR SUBJECTIVE GAME MEMORY ===
${recentHistory}

=== YOUR PRIVATE STATE (KNOWN ONLY TO YOU) ===
${privateStateStr}

=== CURRENT TABLE STATE ===
${situation.gameStateSummary}

=== SITUATION TO REACT TO ===
${situation.currentPrompt}

Respond in JSON format:
{
  "speechAct": "TABLE_TALK" | "BANTER" | "WHISPER" | "PROVOKE" | "MISDIRECT",
  "text": "spoken line (1-2 sentences)",
  "innerMonologue": "private internal thought / read (1 sentence)"
}`;

    return {
      agentId,
      agentName: mem.participant.name,
      systemInstruction,
      userPrompt,
      subjectiveMemoryLog: mem.storyLog,
      privateState: mem.privateState,
    };
  }

  public async generateAgentReaction(
    agentId: string,
    situation: {
      gameStateSummary: string;
      currentPrompt: string;
      speechActContext?: string;
      recipientId?: string;
      apiKey?: string;
    }
  ): Promise<AgentReactionResult | null> {
    const mem = this.memories.get(agentId);
    if (!mem) return null;

    const bundle = this.buildAgentLlmContext(agentId, situation);
    if (!bundle) return null;

    const defaultRecipientId =
      situation.recipientId ||
      Array.from(this.memories.values()).find((m) => m.participant.isHuman)?.participant.id ||
      Array.from(this.memories.keys()).find((k) => k !== agentId);

    let result: AgentReactionResult | null = null;

    if (this.llmProvider) {
      try {
        const res = await this.llmProvider.generateContent({
          model: 'gemini-2.5-flash',
          systemPrompt: bundle.systemInstruction,
          messages: [{ role: 'user', content: bundle.userPrompt }],
          jsonOutput: true,
          apiKey: situation.apiKey,
        });
        if (res.text) {
          const parsed = JSON.parse(res.text);
          result = {
            speakerId: agentId,
            speakerName: mem.participant.name,
            speechAct: parsed.speechAct || 'TABLE_TALK',
            recipientId: parsed.speechAct === 'WHISPER' ? defaultRecipientId : undefined,
            text: parsed.text,
            innerMonologue: parsed.innerMonologue || 'Calculated move based on memory.',
          };
        }
      } catch {
        // Fallback to deterministic synthesis below
      }
    }

    if (!result) {
      const isWhisper = situation.speechActContext === 'WHISPER';
      result = {
        speakerId: agentId,
        speakerName: mem.participant.name,
        speechAct: isWhisper ? 'WHISPER' : 'TABLE_TALK',
        recipientId: isWhisper ? defaultRecipientId : undefined,
        text: 'Based on what has happened so far, words will not change the state. Let us proceed.',
        innerMonologue: 'Evaluating previous moves from my memory log. Maintaining discipline.',
      };
    }

    mem.innerMonologue = result.innerMonologue;
    if (result.text) {
      this.recordSpeechAct({
        speakerId: agentId,
        speechAct: result.speechAct,
        text: result.text,
        recipientId: result.recipientId,
      });
    }

    return result;
  }

  public getMemory(agentId: string): AgentWorkingMemory | undefined {
    return this.memories.get(agentId);
  }

  public renderComparativeNarratives(): string {
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const cyan = '\x1b[36m';
    const yellow = '\x1b[33m';
    const green = '\x1b[32m';
    const magenta = '\x1b[35m';

    let out = `\n${cyan}========================================================================================${reset}\n`;
    out += `  ${bold}CURATOR CORE: AGENT CONVERSATIONAL CONTEXTS & SUBJECTIVE GAME MEMORY${reset}\n`;
    out += `  ${yellow}Demonstrating how consecutive moves & speech acts form distinct memory streams per mind${reset}\n`;
    out += `${cyan}========================================================================================${reset}\n\n`;

    let paletteIdx = 0;
    for (const [, mem] of this.memories.entries()) {
      const color = mem.participant.isHuman ? green : ANSI_PALETTE[paletteIdx++ % ANSI_PALETTE.length];

      out += `${color}${bold}━━━ AGENT CONTEXT: ${mem.participant.name.toUpperCase()} (${mem.participant.role}) ━━━${reset}\n`;
      out += `  ${bold}Current Soliloquy (Inner Monologue):${reset} "${mem.innerMonologue}"\n`;
      out += `  ${bold}Subjective History Log (Last 5 Turns):${reset}\n`;

      for (const entry of mem.storyLog.slice(-5)) {
        if (entry.includes('[WHISPER')) {
          out += `    ${magenta}• ${entry}${reset}\n`;
        } else if (entry.includes('[OBSERVED')) {
          out += `    \x1b[90m• ${entry}${reset}\n`;
        } else {
          out += `    • ${entry}\n`;
        }
      }
      out += '\n';
    }

    out += `${cyan}----------------------------------------------------------------------------------------${reset}\n`;
    return out;
  }

  public async persistToDatabase(requestId: number, projectId: string): Promise<void> {
    if (!this.prisma) return;

    try {
      const snapshot = Object.fromEntries(
        Array.from(this.memories.entries()).map(([k, v]) => [
          k,
          {
            monologue: v.innerMonologue,
            logCount: v.storyLog.length,
            recentLog: v.storyLog.slice(-5),
          },
        ])
      );

      await this.prisma.response.create({
        data: {
          requestId,
          projectId,
          conversationId: parseInt(this.conversationId, 10) || 1,
          content: `[AgentContextSnapshot] Updated subjective memories for ${this.memories.size} participants.`,
          metadata: snapshot,
        },
      });
    } catch {
      // Non-blocking persistence
    }
  }

  private pushEvent(event: InteractionEvent): void {
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLogEntries) {
      this.eventLog.shift();
    }
  }

  private appendStoryLine(agentId: string, mem: AgentWorkingMemory, line: string): void {
    mem.storyLog.push(line);
    if (mem.storyLog.length > this.autoCompactThreshold) {
      this.compactAgentStoryLog(agentId);
    }
  }
}
