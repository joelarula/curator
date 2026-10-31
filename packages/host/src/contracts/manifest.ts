/**
 * Host capabilities that MiniApps and MiniGames can require or negotiate.
 */
export type HostCapability =
  | 'ast:v2'
  | 'storage:sqlite'
  | 'storage:mariadb'
  | 'channel:repl'
  | 'channel:direct'
  | 'channel:websocket'
  | string;

/**
 * Standard manifest identifying an app or game and declaring its host requirements.
 */
export interface CuratorAppManifest {
  /** Unique domain identifier (e.g. 'poker', 'keeris', 'blueprint'). */
  readonly id: string;
  /** Human-readable display name. */
  readonly name?: string;
  /** Semantic version string. */
  readonly version?: string;
  /** Short description. */
  readonly description?: string;
  /** Capabilities required from the host runtime for backward/forward compatibility negotiation. */
  readonly requiredHostCapabilities?: readonly HostCapability[];
}
