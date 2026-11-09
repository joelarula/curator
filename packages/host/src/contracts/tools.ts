/**
 * Contract representation for a tool exposed or registered by a MiniApp or MiniGame.
 * This separates the domain specification from the engine's internal execution pipeline.
 */
export interface CuratorToolContract<TArgs = Record<string, unknown>, TOutput = unknown> {
  readonly name: string;
  readonly description?: string;
  readonly accessLevel?: string;
  readonly requiredRole?: string;
  readonly parameters?: unknown;
  readonly aliases?: readonly string[];
  readonly usage?: string;
  readonly requiresHumanApproval?: boolean;
  readonly requiresConfirmation?: boolean;
  /** Presentation hints: `progressLabel` names the tool in progress events (plain text, no argument values). */
  readonly ui?: {
    readonly progressLabel?: string;
    /** Offered on conversation messages; called with the declared ones of `text`, `requestId`, `conversationId`. */
    readonly messageAction?: { readonly label: string; readonly icon?: string; readonly appliesTo?: readonly ('assistant' | 'user' | 'tool')[] };
  };
}

