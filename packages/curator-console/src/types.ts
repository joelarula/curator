/**
 * Universal Channel Interface aligned with Curator Core channel contract.
 */
export interface CuratorChannelLike {
  send(type: string, payload?: any): Promise<void | any>;
  on(handler: (event: any) => void): () => void;
  close?(): Promise<void>;
}

export type HarnessLayoutMode = 'stack' | 'workbench';
export type HarnessResourceViewMode = 'grid' | 'list';

export interface HarnessUploadedFile {
  filename: string;
  url: string;
  diskPath?: string;
  mimeType: string;
  size: number;
  bucket?: string;
  projectId?: string;
  attachmentId?: string;
  attachmentUri?: string;
}

export interface HarnessResourceItem {
  id: string | number;
  key: string;
  uri?: string;
  title: string;
  name?: string;
  subtitle?: string;
  description?: string;
  slug?: string;
  link?: string;
  photo?: string;
  photoUrl?: string;
  thumbnailUrl?: string;
  published?: boolean;
  authorKey?: string;
  authorName?: string;
  categories?: Array<{ key: string; name: string; link?: string }>;
  categoryKeys?: string[];
  mimeType?: string;
  size?: number;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface HarnessUiSurface {
  component: 'resource-collection' | 'resource-detail' | string;
  title?: string;
  subtitle?: string;
  viewMode?: HarnessResourceViewMode;
  items?: HarnessResourceItem[];
  item?: HarnessResourceItem | null;
  total?: number;
  categories?: Array<{ key: string; name: string; nameEn?: string; link?: string; paintingCount?: number }>;
  authors?: Array<{ key: string; name: string; link?: string; paintingCount?: number }>;
  filters?: Record<string, any>;
  props?: Record<string, any>;
}

/**
 * Universal Adapter Interface for the Curator Dev Console.
 * Decouples the console UI from the specific runtime environment (WASM, Express, etc.).
 */
export interface CuratorConsoleAdapter {
  // Channel & Message Contract (same as CLI Client / Curator Core)
  channel?: CuratorChannelLike;
  send?: (type: string, payload?: any) => Promise<void | any>;
  on?: (handler: (event: any) => void) => () => void;

  // Engine & RequestProcessor Control
  togglePause?: () => Promise<boolean>;
  getProcessorState?: () => Promise<boolean>;
  pauseRequest?: (requestId: string) => Promise<any>;
  resumeRequest?: (requestId: string) => Promise<any>;

  // Database Lifecycle (Curator SQLite / OPFS)
  exportDatabase?: () => Promise<boolean | ArrayBuffer>;
  importDatabase?: (file: File) => Promise<boolean>;
  resetDatabase?: () => Promise<boolean>;
  getStorageInfo?: () => Promise<{ usage: number; quota: number; storageEngine?: string; isOpfs?: boolean }>;
  getDatabaseHealth?: () => Promise<CuratorDatabaseHealth>;

  // File Upload & Resource Surface Hooks
  uploadFiles?: (
    files: Array<{
      filename: string;
      data: string;
      mimeType?: string;
      bucket?: string;
      projectId?: string;
      resourceId?: number;
    }>
  ) => Promise<{ files: HarnessUploadedFile[] }>;
  listResources?: (filters?: Record<string, any>) => Promise<HarnessUiSurface>;
  customComponents?: Record<string, any>;

  requestGraphql: (query: string, variables?: any) => Promise<any>;
  emitEvent?: (type: string, payload: any) => Promise<any>;
  triggerAgent?: (agentId: string, options?: any) => Promise<any>;
  toggleAgent?: (agentId: string, isActive: boolean) => Promise<any>;
  deleteAgent?: (agentId: string) => Promise<any>;
  onProgress?: (callback: (type: string, payload: any) => void) => () => void;
  onDatabaseChange?: (callback: (info: { tables: string[]; timestamp: number }) => void) => () => void;
}

export interface CuratorTableInfo {
  name: string;
  rowCount: number;
}

export interface CuratorDatabaseHealth {
  storageEngine?: string;
  isOpfs?: boolean;
  tables?: CuratorTableInfo[];
  requestsTotal?: number;
  requestsCompleted?: number;
  requestsFailed?: number;
  requestsPending?: number;
  agentsTotal?: number;
  agentsActive?: number;
}

export type DatabaseHealth = CuratorDatabaseHealth;

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
  lastRunAt?: string;
  [key: string]: any;
}

export interface CuratorRequestSummary {
  id: string;
  scriptId?: string | null;
  parentId?: string | null;
  notifyId?: string | null;
  toolName?: string | null;
  agentName?: string | null;
  status: string;
  retryCount?: number;
  ast: any;
  context?: any;
  scheduledAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  responses?: Array<{
    id: string;
    requestId?: string;
    content: string;
    createdAt?: string;
    status?: string;
  }>;
}

export interface RequestTreeNode {
  id: string;
  raw: CuratorRequestSummary;
  parentId: string | null;
  notifyId: string | null;
  agentName: string;
  status: string;
  nodeType: string;
  toolName?: string;
  summary: string;
  astJson: string;
  contextJson?: string | null;
  createdAt: string;
  scheduledAt?: string | null;
  updatedAt?: string | null;
  durationMs?: number | null;
  retryCount: number;
  depth: number;
  children: RequestTreeNode[];
}
