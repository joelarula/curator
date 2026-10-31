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
}

