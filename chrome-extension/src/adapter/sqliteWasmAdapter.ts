import { DriverAdapter, ResultSet, Query } from '@prisma/client/wasm';

export class SQLiteWasmAdapter implements DriverAdapter {
    flavour = 'sqlite' as const;
    provider = 'sqlite';

    constructor(private db: any) {}

    async connect(): Promise<this> {
        return this;
    }

    async queryRaw(query: Query): Promise<ResultSet> {
        const { sql, args } = query;
        // In sqlite, prisma might pass booleans which sql.js handles best as 1 or 0
        const mappedArgs = args.map(arg => {
            if (typeof arg === 'boolean') return arg ? 1 : 0;
            if (arg instanceof Date) return arg.toISOString();
            return arg;
        });

        try {
            const stmt = this.db.prepare(sql);
            stmt.bind(mappedArgs);

            const columnNames = stmt.getColumnNames();
            const rows: any[][] = [];

            while (stmt.step()) {
                const row = stmt.get();
                // Map numeric types or timestamps if needed
                const mappedRow = row.map(val => {
                    if (typeof val === 'bigint') {
                        return Number(val);
                    }
                    return val;
                });
                rows.push(mappedRow);
            }

            stmt.free();

            // Infer column types based on the first returned row or default to 'Text'
            const columnTypes = columnNames.map((name, index) => {
                for (const row of rows) {
                    const val = row[index];
                    if (val !== null && val !== undefined) {
                        if (typeof val === 'number') {
                            return Number.isInteger(val) ? 'Int32' : 'Double';
                        }
                        if (typeof val === 'boolean') return 'Boolean';
                        if (typeof val === 'bigint') return 'Int64';
                    }
                }
                return 'Text'; // Fallback
            });

            return {
                columnNames,
                columnTypes: columnTypes as any[],
                rows
            };
        } catch (err: any) {
            console.error('[SQLiteWasmAdapter] queryRaw error:', err, 'SQL:', sql, 'Args:', mappedArgs);
            throw err;
        }
    }

    async executeRaw(query: Query): Promise<number> {
        const { sql, args } = query;
        const mappedArgs = args.map(arg => {
            if (typeof arg === 'boolean') return arg ? 1 : 0;
            if (arg instanceof Date) return arg.toISOString();
            return arg;
        });

        try {
            const before = this.db.getRowsModified();
            this.db.run(sql, mappedArgs);
            const after = this.db.getRowsModified();
            return after;
        } catch (err: any) {
            console.error('[SQLiteWasmAdapter] executeRaw error:', err, 'SQL:', sql, 'Args:', mappedArgs);
            throw err;
        }
    }

    async executeScript(script: string): Promise<void> {
        try {
            this.db.run(script);
        } catch (err: any) {
            console.error('[SQLiteWasmAdapter] executeScript error:', err);
            throw err;
        }
    }

    async startTransaction(isolationLevel?: string): Promise<any> {
        try {
            this.db.run('BEGIN TRANSACTION;');
            return {
                queryRaw: this.queryRaw.bind(this),
                executeRaw: this.executeRaw.bind(this),
                executeScript: this.executeScript.bind(this),
                commit: async () => {
                    this.db.run('COMMIT;');
                },
                rollback: async () => {
                    this.db.run('ROLLBACK;');
                }
            };
        } catch (err: any) {
            console.error('[SQLiteWasmAdapter] startTransaction error:', err);
            throw err;
        }
    }

    async close(): Promise<void> {
        if (this.db && typeof this.db.close === 'function') {
            this.db.close();
        }
    }

    async dispose(): Promise<void> {
        await this.close();
    }
}
