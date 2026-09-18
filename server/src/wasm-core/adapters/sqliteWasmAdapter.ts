import type { ISqliteDatabase } from '../types.js';

export interface Query {
    sql: string;
    args: any[];
}

export interface ResultSet {
    columnNames: string[];
    columnTypes: any[];
    rows: any[][];
}

export interface DriverAdapter {
    adapterName?: string;
    flavour: 'sqlite';
    provider: string;
    connect(): Promise<this>;
    queryRaw(query: Query): Promise<ResultSet>;
    executeRaw(query: Query): Promise<number>;
    executeScript(script: string): Promise<void>;
    startTransaction(isolationLevel?: string): Promise<any>;
    close(): Promise<void>;
    dispose(): Promise<void>;
}

/**
 * Numeric ColumnType constants matching Prisma's internal enum
 * (from @prisma/client/wasm — must match the `f` object in client.js).
 */
const ColumnType = {
    Int32:   0,
    Int64:   1,
    Float:   2,
    Double:  3,
    Numeric: 4,
    Boolean: 5,
    Text:    7,
    Date:    8,
    DateTime: 10,
    UnknownNumber: 128,
} as const;

/**
 * Universal SQLite WASM driver adapter for Prisma.
 * Compatible with both sql.js and @sqlite.org/sqlite-wasm (OPFS).
 */
export class SQLiteWasmAdapter implements DriverAdapter {
    adapterName = 'sqlite-wasm';
    flavour = 'sqlite' as const;
    provider = 'sqlite';

    constructor(private db: ISqliteDatabase) {}

    async connect(): Promise<this> {
        return this;
    }

    private mapArgs(args: any[]): any[] {
        return args.map(arg => {
            if (typeof arg === 'boolean') return arg ? 1 : 0;
            if (arg instanceof Date) return arg.toISOString();
            return arg;
        });
    }

    async queryRaw(query: Query): Promise<ResultSet> {
        const { sql, args } = query;
        const mappedArgs = this.mapArgs(args);

        try {
            const stmt: any = this.db.prepare(sql);
            if (typeof stmt.bind === 'function') {
                stmt.bind(mappedArgs);
            }

            const columnNames: string[] = typeof stmt.getColumnNames === 'function'
                ? stmt.getColumnNames()
                : (stmt.columnNames || []);

            const rows: any[][] = [];

            while (stmt.step()) {
                const row = typeof stmt.get === 'function' ? stmt.get() : [];
                rows.push(row.map((val: any) =>
                    typeof val === 'bigint' ? Number(val) : val
                ));
            }

            if (typeof stmt.free === 'function') {
                stmt.free();
            } else if (typeof stmt.finalize === 'function') {
                stmt.finalize();
            }

            const columnTypes = columnNames.map((_name: string, index: number) => {
                for (const row of rows) {
                    const val = row[index];
                    if (val !== null && val !== undefined) {
                        if (typeof val === 'number') return Number.isInteger(val) ? ColumnType.Int32 : ColumnType.Double;
                        if (typeof val === 'boolean') return ColumnType.Boolean;
                        if (typeof val === 'bigint') return ColumnType.Int64;
                    }
                }
                return ColumnType.Text;
            });

            return { columnNames, columnTypes: columnTypes as any[], rows };
        } catch (err: any) {
            console.error('[SQLiteWasmAdapter] queryRaw error:', err, 'SQL:', sql, 'Args:', mappedArgs);
            throw err;
        }
    }

    async executeRaw(query: Query): Promise<number> {
        const { sql, args } = query;
        const mappedArgs = this.mapArgs(args);

        try {
            this.db.run(sql, mappedArgs);
            if (typeof this.db.getRowsModified === 'function') {
                return this.db.getRowsModified();
            }
            if (typeof (this.db as any).changes === 'function') {
                return (this.db as any).changes();
            }
            return 1;
        } catch (err: any) {
            console.error('[SQLiteWasmAdapter] executeRaw error:', err, 'SQL:', sql, 'Args:', mappedArgs);
            throw err;
        }
    }

    async executeScript(script: string): Promise<void> {
        try {
            if (typeof this.db.exec === 'function') {
                this.db.exec(script);
            } else {
                this.db.run(script);
            }
        } catch (err: any) {
            console.error('[SQLiteWasmAdapter] executeScript error:', err);
            throw err;
        }
    }

    async startTransaction(_isolationLevel?: string): Promise<any> {
        const adapterRef = this;
        return {
            queryRaw:      (q: Query)   => adapterRef.queryRaw(q),
            executeRaw:    (q: Query)   => adapterRef.executeRaw(q),
            executeScript: (s: string)  => adapterRef.executeScript(s),
            commit:        async () => {},
            rollback:      async () => {},
        };
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
