/**
 * Turns a workflow expression (CoffeeScript-style `not` / `and` / `or`, plain property paths) into the JavaScript the
 * processor evaluates: boolean words become operators and property chains on the well-known roots become null-safe.
 * Text inside string literals ('…', "…", `…`) is left exactly as written.
 */

const STRING_LITERAL = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;

/** Applies `fn` to the parts of `expr` outside string literals. */
export function mapOutsideStrings(expr: string, fn: (code: string) => string): string {
  let out = '';
  let last = 0;
  for (const m of expr.matchAll(STRING_LITERAL)) {
    out += fn(expr.slice(last, m.index)) + m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  return out + fn(expr.slice(last));
}

const SAFE_ROOTS = /(\$(?:state|context|params|config|actor|last|response)\b|__item\d*\b)((?:\??\.[a-zA-Z_$][\w$]*|\[[^\]]+\])+)/g;

export function normalizeExpression(expr: string): string {
  return mapOutsideStrings(expr, (code) =>
    code
      .replace(/\bnot\s+/g, '!')
      .replace(/\s+and\s+/g, ' && ')
      .replace(/\s+or\s+/g, ' || ')
      // Null-safe chains (`?.`): a dot already written as `?.` stays as it is
      .replace(SAFE_ROOTS, (_m, root: string, chain: string) => `${root}${chain.replace(/(?<!\?)\.(?=[a-zA-Z_$])/g, '?.')}`)
  );
}
