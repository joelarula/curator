import { graphql, GraphQLSchema } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';

// Import shared schema and resolvers
import { typeDefs } from '../schema/index.js';
import { resolvers } from '../resolvers/index.js';

// Import custom WASM database adapter
import { SQLiteWasmAdapter } from './adapters/sqliteWasmAdapter.js';
import { SCHEMA_DDL, SEED_SQL } from './adapters/schema.js';

// Import generated Prisma client for SQLite (edge/wasm target)
import { PrismaClient } from '../generated/prisma-sqlite/edge.js';

import type {
    ICuratorCoreConfig,
    IGraphqlRequest,
    IGraphqlResult,
    ISqliteDatabase,
} from './types.js';

export class CuratorWasmCore {
    private db: ISqliteDatabase | null = null;
    private prisma: PrismaClient | null = null;
    private schema: GraphQLSchema | null = null;
    private defaultUserId = 'curator-user';
    private activeProjectId = 'default';
    private onPersistCallback?: () => Promise<void> | void;
    private onLogCallback?: (level: 'INFO' | 'WARN' | 'ERROR', type: string, message: string, detail?: any) => void;
    private graphqlQueuePromise: Promise<void> = Promise.resolve();
    private isReady = false;

    constructor() {}

    public log(level: 'INFO' | 'WARN' | 'ERROR', type: string, message: string, detail?: any) {
        if (this.onLogCallback) {
            this.onLogCallback(level, type, message, detail);
        } else {
            console.log(`[CuratorWasmCore][${level}][${type}] ${message}`, detail || '');
        }
    }

    public async init(config: ICuratorCoreConfig): Promise<void> {
        this.db = config.db;
        if (config.defaultUserId) this.defaultUserId = config.defaultUserId;
        if (config.defaultProjectId) this.activeProjectId = config.defaultProjectId;
        if (config.onPersist) this.onPersistCallback = config.onPersist;
        if (config.onLog) this.onLogCallback = config.onLog;

        this.log('INFO', 'INIT', 'Initializing Curator WASM Core schema and database...');

        // Ensure tables exist
        try {
            if (typeof this.db.exec === 'function') {
                this.db.exec(SCHEMA_DDL);
            } else {
                this.db.run(SCHEMA_DDL);
            }
            this.log('INFO', 'INIT', 'Schema DDL applied successfully.');
        } catch (err: any) {
            this.log('WARN', 'INIT', `Schema DDL note: ${err.message}`);
        }

        // Apply baseline seeds
        try {
            if (typeof this.db.exec === 'function') {
                this.db.exec(SEED_SQL);
            } else {
                this.db.run(SEED_SQL);
            }
            this.log('INFO', 'INIT', 'Baseline seeds applied.');
        } catch (err: any) {
            this.log('WARN', 'INIT', `Seed note: ${err.message}`);
        }

        // Instantiate Prisma Client with universal WASM adapter
        const adapter = new SQLiteWasmAdapter(this.db);
        this.prisma = new PrismaClient({ adapter: adapter as any });

        // Build executable schema
        const resolverList = [resolvers];
        if (config.customResolvers) {
            resolverList.push(config.customResolvers);
        }

        this.schema = makeExecutableSchema({
            typeDefs: [typeDefs],
            resolvers: resolverList,
        });

        this.isReady = true;
        this.log('INFO', 'INIT', 'Curator WASM Core fully ready!');
    }

    public async handleGraphQL(request: IGraphqlRequest): Promise<IGraphqlResult> {
        if (!this.isReady || !this.schema || !this.prisma) {
            throw new Error('CuratorWasmCore is not ready. Call init() first.');
        }

        const { query, variables, activeProjectId, userId } = request;
        const effectiveProjectId = activeProjectId || this.activeProjectId;
        const effectiveUserId = userId || this.defaultUserId;
        const activeProjectIds = request.activeProjectIds || [effectiveProjectId];

        return new Promise<IGraphqlResult>((resolve) => {
            // Queue queries sequentially to prevent SQLite WASM transaction locks
            this.graphqlQueuePromise = this.graphqlQueuePromise
                .catch(() => {})
                .then(async () => {
                    try {
                        const result = await graphql({
                            schema: this.schema!,
                            source: query,
                            variableValues: variables,
                            contextValue: {
                                prisma: this.prisma,
                                user: { id: effectiveUserId },
                                activeProjectId: effectiveProjectId,
                                activeProjectIds,
                                agentScheduler:   { getState: () => ({ isRunning: false, activeJobs: 0 }) },
                                requestProcessor: { getState: () => ({ isRunning: false, requestsProcessed: 0 }) },
                            },
                        });

                        // If a mutation was executed, trigger persistence
                        if (/\bmutation\b/i.test(query) && this.onPersistCallback) {
                            try {
                                await this.onPersistCallback();
                            } catch (err: any) {
                                this.log('ERROR', 'PERSIST', `Persistence failed: ${err.message}`);
                            }
                        }

                        resolve(result as any);
                    } catch (err: any) {
                        this.log('ERROR', 'GRAPHQL_EXCEPTION', err.message, err.stack);
                        resolve({ errors: [{ message: err.message }] });
                    }
                });
        });
    }

    public exportDatabase(): Uint8Array | null {
        if (this.db && typeof this.db.export === 'function') {
            return this.db.export();
        }
        return null;
    }

    public getDb(): ISqliteDatabase | null {
        return this.db;
    }

    public getPrisma(): PrismaClient | null {
        return this.prisma;
    }

    public setActiveProjectId(projectId: string) {
        this.activeProjectId = projectId;
    }

    public getActiveProjectId(): string {
        return this.activeProjectId;
    }
}
