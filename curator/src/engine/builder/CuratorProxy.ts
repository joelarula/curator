/**
 * Fluent expression & condition builder methods available on every `TypedPathProxy<T>`.
 * Brings Rust/Bevy-style ergonomic sugar to Curator AST expressions while preserving
 * full TypeScript autocomplete and compile-time path validation.
 */
export interface ProxyExprMethods<T> {
  (): string;
  toString(): string;
  valueOf(): string;
  toJSON(): string;
  /** Dynamic or static index access into an array/collection proxy: `$arr[$idx]` with element type inference. */
  at(index: number | string | TypedPathProxy<any>): TypedPathProxy<T extends Array<infer U> ? U : any>;
  /** Equality check: `($path == value)` */
  eq(value: T | TypedPathProxy<any> | string | number | boolean | null): TypedPathProxy<boolean>;
  /** Inequality check: `($path != value)` */
  ne(value: T | TypedPathProxy<any> | string | number | boolean | null): TypedPathProxy<boolean>;
  /** Greater-than check: `($path > value)` */
  gt(value: number | TypedPathProxy<number> | string): TypedPathProxy<boolean>;
  /** Greater-than-or-equal check: `($path >= value)` */
  gte(value: number | TypedPathProxy<number> | string): TypedPathProxy<boolean>;
  /** Less-than check: `($path < value)` */
  lt(value: number | TypedPathProxy<number> | string): TypedPathProxy<boolean>;
  /** Less-than-or-equal check: `($path <= value)` */
  lte(value: number | TypedPathProxy<number> | string): TypedPathProxy<boolean>;
  /** Addition expression: `(($path || 0) + amount)` */
  add(amount: number | TypedPathProxy<number> | string): TypedPathProxy<number>;
  /** Subtraction expression: `(($path || 0) - amount)` */
  sub(amount: number | TypedPathProxy<number> | string): TypedPathProxy<number>;
  /** Nullish / falsy fallback expression: `($path || fallback)` */
  orDefault<D = T>(fallback: D | TypedPathProxy<any>): TypedPathProxy<NonNullable<T> | D>;
  /** Logical AND: `(($path) and (other))` */
  and(other: unknown): TypedPathProxy<boolean>;
  /** Logical OR: `(($path) or (other))` */
  or(other: unknown): TypedPathProxy<boolean>;
  /** Logical NOT: `not ($path)` */
  not(): TypedPathProxy<boolean>;
  /** Explicit boolean truthiness check: `Boolean($path)` */
  isTruthy(): TypedPathProxy<boolean>;
  /** Explicit boolean falsiness check: `not ($path)` */
  isFalsy(): TypedPathProxy<boolean>;
  /**
   * Matches a human choice answer whether bound as `{ id, value }` or a bare string id:
   * `($path.id == 'id' or $path == 'id' or $path.value == 'id')`
   */
  isChoice(id: string): TypedPathProxy<boolean>;
  /**
   * Matches an action/command whether bound as `{ type: 'CMD' }` or a bare `'CMD'` string:
   * `(($path && $path.type == 'CMD') || $path == 'CMD')`
   */
  isCommand(type: string): TypedPathProxy<boolean>;
  /** Set membership check: `($path == v1 or $path == v2 ...)` */
  in(...values: Array<T | string | number>): TypedPathProxy<boolean>;
  /** Prompt template optional interpolation: `{${path}?}` */
  optional(): string;
  [key: string]: any;
}

/**
 * Recursive TypeScript proxy type that reflects the properties of model T
 * while resolving each property access to its runtime AST expression path string.
 */
export type TypedPathProxy<T> = (T extends (...args: any[]) => any
  ? (...args: Parameters<T>) => ReturnType<T>
  : T extends Array<infer U>
  ? { [index: number]: TypedPathProxy<U>; length: TypedPathProxy<number> } & {
      [K in keyof T]: TypedPathProxy<T[K]>;
    }
  : T extends object
  ? {
      [K in keyof T]-?: TypedPathProxy<NonNullable<T[K]>>;
    }
  : {}) &
  ProxyExprMethods<T>;

function formatLiteral(val: unknown): string {
  if (isPathProxy(val)) return String(val);
  if (typeof val === 'string') {
    if (val.startsWith('$') || val.startsWith('(') || val.startsWith('{{')) return val;
    return `'${val.replace(/'/g, "\\'")}'`;
  }
  if (val === null || val === undefined) return 'null';
  return String(val);
}

/**
 * Extracts a bare variable name from a TypedPathProxy, expression path, or string.
 * e.g. ctx.resumeCmd -> "resumeCmd", params.speechEvt -> "speechEvt", "$context.myVar" -> "myVar"
 */
export function toVarName(target: unknown): string | undefined {
  if (target === undefined || target === null) return undefined;
  const str = String(target);
  return str.replace(/^\$(context|state|params)\./, '');
}

/**
 * Detects if a value is a TypedPathProxy created by createContextProxy.
 */
export function isPathProxy(val: unknown): boolean {
  return Boolean(val && typeof val === 'function' && (val as any).__isPathProxy === true);
}

const PROXY_METHODS = new Set([
  'at',
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'add',
  'sub',
  'orDefault',
  'and',
  'or',
  'not',
  'isTruthy',
  'isFalsy',
  'isChoice',
  'isCommand',
  'in',
  'optional',
]);

/**
 * Creates a typed recursive proxy that resolves property paths and fluent DSL expressions to AST strings.
 * e.g. ctx.gameState.currentStreet => "$context.gameState.currentStreet"
 *      state.turnRejections.orDefault(0).lt(2) => "(($state.turnRejections || 0) < 2)"
 */
export function createContextProxy<T = any>(root = '$context'): TypedPathProxy<T> {
  const paren = (s: string) => (s.includes(' ') && !(s.startsWith('(') && s.endsWith(')')) ? `(${s})` : s);
  const methods: Record<string, (...args: any[]) => any> = {
    at: (index: unknown) => createContextProxy(`${paren(root)}[${index}]`),
    eq: (val: unknown) => createContextProxy(`(${paren(root)} == ${formatLiteral(val)})`),
    ne: (val: unknown) => createContextProxy(`(${paren(root)} != ${formatLiteral(val)})`),
    gt: (val: unknown) => createContextProxy(`(${paren(root)} > ${formatLiteral(val)})`),
    gte: (val: unknown) => createContextProxy(`(${paren(root)} >= ${formatLiteral(val)})`),
    lt: (val: unknown) => createContextProxy(`(${paren(root)} < ${formatLiteral(val)})`),
    lte: (val: unknown) => createContextProxy(`(${paren(root)} <= ${formatLiteral(val)})`),
    add: (val: unknown) => createContextProxy(`(${paren(root)} + ${formatLiteral(val)})`),
    sub: (val: unknown) => createContextProxy(`(${paren(root)} - ${formatLiteral(val)})`),
    orDefault: (fallback: unknown) => createContextProxy(`${paren(root)} || ${formatLiteral(fallback)}`),
    and: (other: unknown) => createContextProxy(`(${paren(root)} and ${other})`),
    or: (other: unknown) => createContextProxy(`(${paren(root)} or ${other})`),
    not: () => createContextProxy(`not ${paren(root)}`),
    isTruthy: () => createContextProxy(`${root}`),
    isFalsy: () => createContextProxy(`not ${paren(root)}`),
    isChoice: (id: string) =>
      createContextProxy(`(${root}.id == '${id}' or ${root} == '${id}' or ${root}.value == '${id}')`),
    isCommand: (type: string) =>
      createContextProxy(`((${root} && ${root}.type == '${type}') || ${root} == '${type}')`),
    in: (...values: unknown[]) =>
      createContextProxy(`(${values.map((v) => `${root} == ${formatLiteral(v)}`).join(' or ')})`),
    optional: () => `{${root}?}`,
  };

  const targetObj = Object.assign(() => root, {
    toJSON: () => root,
    toString: () => root,
    valueOf: () => root,
    __isPathProxy: true,
    ...methods,
  });

  const handler: ProxyHandler<any> = {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') {
        if (prop === Symbol.toPrimitive) return () => root;
        return undefined;
      }
      const strProp = String(prop);
      if (strProp === '__isPathProxy') return true;
      if (strProp === 'toString' || strProp === 'valueOf' || strProp === 'toJSON') {
        return () => root;
      }
      if (PROXY_METHODS.has(strProp)) {
        return methods[strProp];
      }
      // Support dynamic bracket indexing when another proxy path is passed: e.g. players[activePlayerIdx]
      if (strProp.startsWith('$') || strProp.includes('.') || strProp.includes('[')) {
        return createContextProxy(`${root}[${strProp}]`);
      }
      return createContextProxy(`${root}.${strProp}`);
    },
    apply() {
      return root;
    },
  };
  return new Proxy(targetObj, handler) as any;
}

/**
 * Declarative condition helpers for building expressions without raw string concatenation.
 */
export const not = (expr: unknown): string => `!(${expr})`;
export const and = (...exprs: unknown[]): string => exprs.map((e) => `(${e})`).join(' && ');
export const or = (...exprs: unknown[]): string => exprs.map((e) => `(${e})`).join(' || ');
export const eq = (a: unknown, b: unknown): string => `(${a} === ${typeof b === 'string' ? `'${b}'` : JSON.stringify(b)})`;
