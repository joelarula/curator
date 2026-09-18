export interface ISqliteStatement {
  bind(params: any[]): void;
  getColumnNames(): string[];
  step(): boolean;
  get(): any[];
  free(): void;
}

export interface ISqliteDatabase {
  prepare(sql: string): ISqliteStatement;
  run(sql: string, params?: any[]): void;
  getRowsModified(): number;
  export?(): Uint8Array;
  close(): void;
  exec?(sql: string): void;
}

export interface ICuratorCoreConfig {
  db: ISqliteDatabase;
  defaultUserId?: string;
  defaultProjectId?: string;
  onPersist?: () => Promise<void> | void;
  onLog?: (level: 'INFO' | 'WARN' | 'ERROR', type: string, message: string, detail?: any) => void;
  customResolvers?: any;
}

export interface IGraphqlRequest {
  query: string;
  variables?: any;
  activeProjectId?: string;
  activeProjectIds?: string[];
  userId?: string;
}

export interface IGraphqlResult {
  data?: any;
  errors?: ReadonlyArray<{ message: string; [key: string]: any }>;
}

export interface DbRegistry {
  activeId: string;
  databases: { id: string; name: string }[];
}
