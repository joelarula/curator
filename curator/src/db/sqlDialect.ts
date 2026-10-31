/**
 * Raw SQL that runs on every engine curator supports (SQLite, MariaDB/MySQL, Postgres).
 *
 * Write identifiers in ANSI "double quotes" (Postgres needs them for camelCase columns; MySQL gets backticks)
 * and string literals in 'single quotes'. Interpolated values become placeholders (`?`, or `$n` on Postgres)
 * and arrays expand to a comma-separated list, for `IN (...)`. Only the static template text is rewritten,
 * never the values.
 *
 *   const sql = sqlFor(prisma);
 *   await prisma.$executeRawUnsafe(...sql`UPDATE "Request" SET "context" = NULL WHERE "id" IN (${ids})`);
 */

export type SqlDialect = 'sqlite' | 'mysql' | 'postgresql';

/** Arguments for `$queryRawUnsafe` / `$executeRawUnsafe`: the SQL text followed by its values. */
export type RawQuery = [text: string, ...values: unknown[]];

export type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => RawQuery;

/** Dialect of a Prisma client (plain or `$extends`-ed), from the provider its schema was generated for. */
export function sqlDialect(prisma: any): SqlDialect {
  const provider = prisma?._activeProvider;
  if (provider === 'sqlite' || provider === 'mysql' || provider === 'postgresql') return provider;
  throw new Error(`[sqlDialect] Unsupported or unknown Prisma provider: ${String(provider)}`);
}

/** `FOR UPDATE SKIP LOCKED` (Postgres, MariaDB 10.6+, MySQL 8). SQLite has a single writer and no row locks. */
export function supportsSkipLocked(dialect: SqlDialect): boolean {
  return dialect !== 'sqlite';
}

const quoteIdentifiers = (dialect: SqlDialect, text: string) => (dialect === 'mysql' ? text.replace(/"/g, '`') : text);

/** A piece of SQL with its own values, spliced in where it is interpolated (for optional clauses). */
export class SqlFragment {
  constructor(readonly strings: readonly string[], readonly params: readonly unknown[]) {}
}

/** Builds a fragment, written the same way as a full query: `sqlPart\` AND "conversationId" IN (${ids})\``. */
export const sqlPart = (strings: TemplateStringsArray, ...params: unknown[]) => new SqlFragment(strings, params);

/** A fragment that adds nothing (the "else" of an optional clause). */
export const SQL_EMPTY = new SqlFragment([''], []);

export function sqlTag(dialect: SqlDialect): SqlTag {
  return (strings, ...params) => {
    const values: unknown[] = [];
    const render = (parts: readonly string[], args: readonly unknown[]): string => {
      let text = quoteIdentifiers(dialect, parts[0]);
      args.forEach((param, i) => {
        if (param instanceof SqlFragment) {
          text += render(param.strings, param.params);
        } else {
          const items = Array.isArray(param) ? param : [param];
          if (items.length === 0) throw new Error('[sqlDialect] Empty list parameter (IN () is invalid SQL)');
          text += items
            .map(item => {
              values.push(item);
              return dialect === 'postgresql' ? `$${values.length}` : '?';
            })
            .join(', ');
        }
        text += quoteIdentifiers(dialect, parts[i + 1]);
      });
      return text;
    };
    return [render(strings, params), ...values];
  };
}

export const sqlFor = (prisma: any): SqlTag => sqlTag(sqlDialect(prisma));
