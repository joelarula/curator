/**
 * Universal Adapter Interface for the Curator Dev Console.
 * Decouples the console UI from the specific runtime environment (WASM, Express, etc.).
 */
export interface CuratorConsoleAdapter {
  // Engine & RequestProcessor Control
  togglePause?: () => Promise<boolean>;
  getProcessorState?: () => Promise<boolean>;
  pauseRequest?: (requestId: string) => Promise<any>;
  resumeRequest?: (requestId: string) => Promise<any>;

  // Database Lifecycle (Curator SQLite / OPFS)
  exportDatabase?: () => Promise<boolean | ArrayBuffer>;
  importDatabase?: (file: File) => Promise<boolean>;
  resetDatabase?: () => Promise<boolean>;
  getStorageInfo?: () => Promise<{ usage: number; quota: number }>;

  requestGraphql: (query: string, variables?: any) => Promise<any>;
  triggerAgent?: (agentId: string, options?: any) => Promise<any>;
  onProgress?: (callback: (type: string, payload: any) => void) => () => void;
  onDatabaseChange?: (callback: (info: { tables: string[]; timestamp: number }) => void) => () => void;
}

export interface CuratorLogEntry {
  type: 'info' | 'ok' | 'error' | 'warn' | 'tx' | 'rx';
  text: string;
  time: string;
}

export interface CuratorAgentSummary {
  id: string;
  name: string;
  schedule?: string;
  isActive: boolean;
  episodesCount?: number;
  tracksCount?: number;
  lastRunAt?: string;
}

export interface CuratorRequestSummary {
  id: string;
  ast: any;
  status: string;
  createdAt: string;
  responses?: Array<{
    id: string;
    content: string;
    createdAt: string;
  }>;
}
