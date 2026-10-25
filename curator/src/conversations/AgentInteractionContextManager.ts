import { EventEmitter } from 'events';
import type { AmbientSpeechActType } from './SpeechActs.js';

export interface InteractionEvent {
  id: string;
  timestamp: number;
  type: 'GAME_MOVE' | 'SPEECH_ACT' | 'FRAME_EVENT' | 'REVELATION';
  actorId: string;
  actorName: string;
  action: string;
  payload?: any;
  speechAct?: AmbientSpeechActType | string;
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
  speechAct: AmbientSpeechActType | string;
  recipientId?: string;
  text: string;
  innerMonologue: string;
}

/**
 * AgentInteractionContextManager
 *
 * Models and manages the unified stream of consecutive game moves and speech acts,
 * synthesizing subjective working memories and context streams per agent.
 *
 * Guarantees:
 * 1. Asymmetric Exposure: Whispers and private states are revealed only to authorized participants.
 * 2. Unbroken Game Memory: AI agents maintain an evolving chronological log of moves, speech, and reads.
 * 3. Gemini / LLM Synthesis: Generates contextual prompts and agentic soliloquies/dialogue.
 * 4. Bounded Context & Compaction: Older moves automatically compact to prevent unbounded token growth.
 * 5. Checkpoints & Epochs: First-class epoch demarcation (hands, rounds) and checkpoint snapshots.
 */
export class AgentInteractionContextManager extends EventEmitter {
  public readonly conversationId: string;
  private memories: Map<string, AgentWorkingMemory> = new Map();
  private eventLog: InteractionEvent[] = [];
  private prisma?: any;

  public readonly maxStoryLogEntries: number;
  public readonly autoCompactThreshold: number;
  public readonly maxEventLogEntries: number;
  public readonly promptHistoryWindow: number;
  private currentEpochId?: string;
  private checkpoints: Map<string, InteractionCheckpoint> = new Map();
  private latestCheckpoint?: InteractionCheckpoint;

  constructor(options: AgentInteractionContextOptions | { conversationId: string; prisma?: any }) {
    super();
    this.conversationId = options.conversationId;
    this.prisma = options.prisma;
    this.maxStoryLogEntries = (options as AgentInteractionContextOptions).maxStoryLogEntries ?? 25;
    this.autoCompactThreshold = (options as AgentInteractionContextOptions).autoCompactThreshold ?? 35;
    this.maxEventLogEntries = (options as AgentInteractionContextOptions).maxEventLogEntries ?? 50;
    this.promptHistoryWindow = (options as AgentInteractionContextOptions).promptHistoryWindow ?? 12;
  }

  /**
   * Compacts older story log entries for an agent into a unified summary to keep memory bounded.
   */
  public compactAgentStoryLog(agentId: string): void {
    const mem = this.memories.get(agentId);
    if (!mem || mem.storyLog.length <= this.maxStoryLogEntries) return;

    const pruneCount = mem.storyLog.length - this.maxStoryLogEntries;
    const oldEntries = mem.storyLog.slice(0, pruneCount);
    const summaryTag = `[SUMMARY of ${oldEntries.length} prior actions in ${this.currentEpochId || 'previous turns'}]`;
    mem.storyLog = [summaryTag, ...mem.storyLog.slice(pruneCount)];
    this.emit('memory:compacted', { agentId, prunedCount: oldEntries.length });
  }

  /**
   * Starts a new logical epoch (e.g. "Hand #2", "Round 3") across all participants.
   */
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

  /**
   * Creates a formal checkpoint snapshot of all participants and optional domain state.
   */
  public createCheckpoint(stateSnapshot?: Record<string, any>): InteractionCheckpoint {
    const id = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const participants = Array.from(this.memories.values()).map((m) => ({ ...m.participant }));
    const memoriesSnapshot: Record<string, any> = {};

    for (const [agentId, mem] of this.memories.entries()) {
      memoriesSnapshot[agentId] = {
        privateState: { ...mem.privateState },
        innerMonologue: mem.innerMonologue,
        recentStoryLog: mem.storyLog.slice(-this.maxStoryLogEntries),
        peerModels: mem.peerModels ? JSON.parse(JSON.stringify(mem.peerModels)) : {},
        epistemicState: mem.epistemicState ? JSON.parse(JSON.stringify(mem.epistemicState)) : {},
      };
    }

    const checkpoint: InteractionCheckpoint = {
      id,
      conversationId: this.conversationId,
      epochId: this.currentEpochId,
      timestamp: Date.now(),
      participants,
      memories: memoriesSnapshot,
      stateSnapshot: stateSnapshot ? JSON.parse(JSON.stringify(stateSnapshot)) : undefined,
    };

    this.checkpoints.set(id, checkpoint);
    this.latestCheckpoint = checkpoint;
    this.emit('checkpoint:created', checkpoint);

    // If Prisma is available, asynchronously persist checkpoint to Conversation.metadata
    if (this.prisma?.conversation?.update) {
      this.persistCheckpoint(checkpoint).catch(() => {});
    }

    return checkpoint;
  }

  /**
   * Retrieves a checkpoint by its ID.
   */
  public getCheckpoint(id: string): InteractionCheckpoint | undefined {
    return this.checkpoints.get(id);
  }

  /**
   * Retrieves the most recently created checkpoint.
   */
  public getLatestCheckpoint(): InteractionCheckpoint | undefined {
    return this.latestCheckpoint;
  }

  /**
   * Returns all stored checkpoints in chronological order.
   */
  public getAllCheckpoints(): InteractionCheckpoint[] {
    return Array.from(this.checkpoints.values());
  }

  /**
   * Persists a checkpoint to the database under Conversation.metadata.lastCheckpoint.
   */
  public async persistCheckpoint(checkpoint?: InteractionCheckpoint): Promise<void> {
    const cp = checkpoint || this.latestCheckpoint;
    if (!cp || !this.prisma?.conversation) return;

    try {
      const convIdNum = parseInt(this.conversationId, 10);
      const where = !isNaN(convIdNum) ? { id: convIdNum } : { externalId: this.conversationId };
      const current = await this.prisma.conversation.findUnique({ where });
      const currentMeta = typeof current?.metadata === 'object' && current?.metadata ? current.metadata : {};

      await this.prisma.conversation.update({
        where,
        data: {
          metadata: {
            ...currentMeta,
            lastCheckpoint: cp,
          },
        },
      });
      this.emit('checkpoint:persisted', { checkpointId: cp.id });
    } catch {
      // Non-blocking persistence
    }
  }

  /**
   * Restores working memory states from an existing checkpoint.
   */
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

  /**
   * Generates a projected, non-redundant state view for an individual agent.
   */
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
   * Registers a participant (human or AI agent) into the interaction frame.
   */
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

  /**
   * Sets or updates private state known exclusively to this agent (e.g. hole cards).
   */
  public setPrivateState(agentId: string, state: Record<string, any>): void {
    const mem = this.memories.get(agentId);
    if (mem) {
      mem.privateState = { ...mem.privateState, ...state };
    }
  }

  /**
   * Records a game move (e.g. BET, RAISE, CALL, FOLD, CHECK, DEAL, SHOWDOWN).
   * Appends subjective perception to each participant's narrative log.
   */
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

    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLogEntries) {
      this.eventLog.shift();
    }

    // Update subjective memory of each participant
    for (const [id, mem] of this.memories.entries()) {
      if (options.isPrivate && options.privateTo && !options.privateTo.includes(id)) {
        continue;
      }

      if (id === options.actorId) {
        mem.storyLog.push(`I executed move [${options.action}]: ${options.summary}`);
      } else {
        mem.storyLog.push(`Observed ${actorName} execute [${options.action}]: ${options.summary}`);
      }

      if (mem.storyLog.length > this.autoCompactThreshold) {
        this.compactAgentStoryLog(id);
      }
    }

    this.emit('event:game_move', event);
  }

  /**
   * Records a communicative speech act (TABLE_TALK, BANTER, WHISPER, PROVOKE, etc.).
   * Enforces asymmetric privacy: whispers are recorded in full for sender and recipient,
   * while bystanders only observe that a whisper occurred.
   */
  public recordSpeechAct(options: {
    speakerId: string;
    speechAct: AmbientSpeechActType | string;
    text: string;
    recipientId?: string;
  }): void {
    const speakerMem = this.memories.get(options.speakerId);
    const speakerName = speakerMem ? speakerMem.participant.name : options.speakerId;
    const isWhisper = options.speechAct === 'WHISPER';
    const recipientMem = options.recipientId ? this.memories.get(options.recipientId) : undefined;
    const recipientName = recipientMem ? recipientMem.participant.name : options.recipientId;

    const event: InteractionEvent = {
      id: `spk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      type: 'SPEECH_ACT',
      actorId: options.speakerId,
      actorName: speakerName,
      action: options.speechAct,
      speechAct: options.speechAct,
      recipientId: options.recipientId,
      isPrivate: isWhisper,
      authorizedParticipantIds: isWhisper && options.recipientId ? [options.speakerId, options.recipientId] : undefined,
      summary: `${speakerName} spoke (${options.speechAct}): "${options.text}"`,
    };

    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLogEntries) {
      this.eventLog.shift();
    }

    for (const [id, mem] of this.memories.entries()) {
      if (isWhisper) {
        if (id === options.speakerId) {
          mem.storyLog.push(`[WHISPER to ${recipientName || 'someone'}]: "${options.text}"`);
        } else if (id === options.recipientId) {
          mem.storyLog.push(`[WHISPER from ${speakerName}]: "${options.text}"`);
          mem.innerMonologue = `${speakerName} whispered privately to me. Evaluating intent.`;
        } else {
          // Asymmetric exposure: bystander sees that whispering occurred without secret content
          mem.storyLog.push(`[OBSERVED]: ${speakerName} whispered secretly to ${recipientName || 'another player'}.`);
        }
      } else {
        // Public dialogue
        if (id === options.speakerId) {
          mem.storyLog.push(`[SPOKE to table (${options.speechAct})]: "${options.text}"`);
        } else {
          mem.storyLog.push(`[${speakerName} (${options.speechAct})]: "${options.text}"`);
        }
      }

      if (mem.storyLog.length > this.autoCompactThreshold) {
        this.compactAgentStoryLog(id);
      }
    }

    this.emit('event:speech_act', event);
  }

  /**
   * Compiles the subjective LLM context bundle for a specific agent.
   */
  public buildAgentLlmContext(
    agentId: string,
    situation: {
      gameStateSummary: string;
      currentPrompt: string;
    }
  ): LlmContextBundle | null {
    const mem = this.memories.get(agentId);
    if (!mem) return null;

    const systemInstruction = `${mem.participant.personaPrompt || `You are ${mem.participant.name}, a strategic player.`}
You are participating in an interactive game session.
You have private memory and subjective observations of everything that has occurred.
Keep your identity and secret knowledge protected unless revealed at showdown.`;

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

  /**
   * Generates an agentic reaction using Gemini API or cognitive synthesizer,
   * automatically committing the resulting soliloquy and utterance to memory.
   */
  public async generateAgentReaction(
    agentId: string,
    situation: {
      gameStateSummary: string;
      currentPrompt: string;
      speechActContext?: string;
      apiKey?: string;
    }
  ): Promise<AgentReactionResult | null> {
    const mem = this.memories.get(agentId);
    if (!mem) return null;

    const apiKey = situation.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const bundle = this.buildAgentLlmContext(agentId, situation);
    if (!bundle) return null;

    let result: AgentReactionResult | null = null;

    if (apiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const payload = {
          systemInstruction: { parts: [{ text: bundle.systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: bundle.userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.8,
            maxOutputTokens: 250,
          },
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data: any = await res.json();
          const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidate) {
            const parsed = JSON.parse(candidate);
            result = {
              speakerId: agentId,
              speakerName: mem.participant.name,
              speechAct: parsed.speechAct || 'TABLE_TALK',
              recipientId: parsed.speechAct === 'WHISPER' ? 'hero' : undefined,
              text: parsed.text,
              innerMonologue: parsed.innerMonologue || 'Calculated move based on memory.',
            };
          }
        }
      } catch {
        // Fallback below
      }
    }

    if (!result) {
      // Dynamic cognitive agentic synthesis
      const isWhisper = situation.speechActContext === 'WHISPER';
      result = {
        speakerId: agentId,
        speakerName: mem.participant.name,
        speechAct: isWhisper ? 'WHISPER' : 'TABLE_TALK',
        recipientId: isWhisper ? 'hero' : undefined,
        text: `Based on what has happened so far, words won't change the game state. Let us play.`,
        innerMonologue: `Evaluating previous moves from my memory log. Maintaining discipline.`,
      };
    }

    // Update memory with generated reaction
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

  /**
   * Returns the complete working memory of an agent.
   */
  public getMemory(agentId: string): AgentWorkingMemory | undefined {
    return this.memories.get(agentId);
  }

  /**
   * Renders a human-readable comparative view of all agent subjective memories.
   */
  public renderComparativeNarratives(): string {
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const cyan = '\x1b[36m';
    const yellow = '\x1b[33m';
    const green = '\x1b[32m';
    const magenta = '\x1b[35m';

    let out = '\n';
    out += `${cyan}========================================================================================${reset}\n`;
    out += `  ${bold}CURATOR CORE: AGENT CONVERSATIONAL CONTEXTS & SUBJECTIVE GAME MEMORY${reset}\n`;
    out += `  ${yellow}Demonstrating how consecutive game moves & speech acts form distinct memory streams per mind${reset}\n`;
    out += `${cyan}========================================================================================${reset}\n\n`;

    for (const [id, mem] of this.memories.entries()) {
      const isHuman = mem.participant.isHuman;
      const color = isHuman ? green : id === 'viper' ? magenta : id === 'maddog' ? yellow : cyan;

      out += `${color}${bold}━━━ AGENT CONTEXT: ${mem.participant.name.toUpperCase()} (${mem.participant.role}) ━━━${reset}\n`;
      out += `  ${bold}Current Soliloquy (Inner Monologue):${reset} "${mem.innerMonologue}"\n`;
      out += `  ${bold}Subjective History Log (Last 5 Turns):${reset}\n`;

      const recent = mem.storyLog.slice(-5);
      for (const entry of recent) {
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

  /**
   * Persists narrative snapshot to the database.
   */
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
}
