import { DriverAdapter, ResultSet, Query } from '@prisma/client/wasm';

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
 * SQLite WASM driver adapter for Prisma.
 *
 * Transactions run in AUTOCOMMIT mode — each statement is atomic at the
 * SQLite level by default. We deliberately do NOT issue BEGIN/COMMIT/ROLLBACK
 * because Prisma's WASM query engine (Rust) tracks transaction IDs internally.
 * When SQLite auto-aborts a transaction on a constraint error, the engine's
 * internal state becomes inconsistent with our adapter, throwing:
 *   "Active transaction found in closed transactions list"
 *
 * Running in autocommit avoids that entirely: commit/rollback are no-ops so
 * Prisma's engine always sees a clean success path for transaction lifecycle.
 * For a single-user local SQLite database this is safe — each Prisma operation
 * is a single statement and is already atomic.
 */
export class SQLiteWasmAdapter implements DriverAdapter {
    flavour = 'sqlite' as const;
    provider = 'sqlite';

    constructor(private db: any) {}

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
            const stmt = this.db.prepare(sql);
            stmt.bind(mappedArgs);

            const columnNames = stmt.getColumnNames();
            const rows: any[][] = [];

            while (stmt.step()) {
                const row = stmt.get();
                rows.push(row.map((val: any) =>
                    typeof val === 'bigint' ? Number(val) : val
                ));
            }
            stmt.free();

            const columnTypes = columnNames.map((_name: string, index: number) => {
                for (const row of rows) {
                    const val = row[index];
                    if (val !== null && val !== undefined) {
                        if (typeof val === 'number') return Number.isInteger(val) ? ColumnType.Int32 : ColumnType.Double;
                        if (typeof val === 'boolean') return ColumnType.Boolean;
                        if (typeof val === 'bigint') return ColumnType.Int64;
                    }
                }
                return ColumnType.Text; // Prisma's numeric Text type (7)
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
            return this.db.getRowsModified();
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

    /**
     * Returns a fake transaction that runs in SQLite autocommit mode.
     * commit() and rollback() are intentional no-ops — Prisma's WASM engine
     * always sees them succeed, preventing internal state corruption.
     */
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
