/**
 * Contract representation for a state reducer exposed or registered by a MiniApp or MiniGame.
 */
export interface CuratorReducerContract<TArgs = Record<string, unknown>, TOutput = unknown> {
  readonly name: string;
  readonly reducerName?: string;
  (args: TArgs): TOutput;
}
