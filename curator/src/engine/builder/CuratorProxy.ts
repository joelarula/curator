export type ElemOf<T> = T extends ReadonlyArray<infer U> ? U : any;

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
  at(index: number | string | TypedPathProxy<any>): TypedPathProxy<ElemOf<T>>;
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
  /** Explicit boolean truthiness check */
  isTruthy(): TypedPathProxy<boolean>;
  /** Explicit boolean falsiness check: `not ($path)` */
  isFalsy(): TypedPathProxy<boolean>;
  /** Explicit boolean coercion: `Boolean($path)` */
  toBoolean(): TypedPathProxy<boolean>;
  /** True when a string path is defined and non-empty after trimming: `Boolean($path && String($path).trim())` */
  nonEmpty(): TypedPathProxy<boolean>;
  /** Uppercase string expression: `String($path || '').toUpperCase()` */
  upper(): TypedPathProxy<string>;
  /** Lowercase string expression: `String($path || '').toLowerCase()` */
  lower(): TypedPathProxy<string>;
  /** Trimmed string expression: `String($path || '').trim()` */
  trim(): TypedPathProxy<string>;
  /** Ternary conditional expression: `($path ? whenTrue : whenFalse)` */
  ternary<A, B>(whenTrue: A, whenFalse: B): TypedPathProxy<A | B>;
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
  /** Prompt template subtraction interpolation: `{${path} - ${other}?}` */
  subTemplate(other: unknown): string;
  /** Array `.find((itemProxy) => cond)` returning a typed element proxy */
  find(predicate: (item: TypedPathProxy<ElemOf<T>>) => unknown): TypedPathProxy<ElemOf<T>>;
  /** Array `.findBy(key, value)` shorthand for `.find((item) => item[key].eq(value))` */
  findBy<K extends keyof ElemOf<T> & string>(key: K, value: unknown): TypedPathProxy<ElemOf<T>>;
  /** Array `.some((itemProxy) => cond)` returning a typed boolean proxy */
  some(predicate: (item: TypedPathProxy<ElemOf<T>>) => unknown): TypedPathProxy<boolean>;
  /** Array `.someBy(key, value)` shorthand for `.some((item) => item[key].eq(value))` */
  someBy<K extends keyof ElemOf<T> & string>(key: K, value: unknown): TypedPathProxy<boolean>;
  /** Array `.every((itemProxy) => cond)` returning a typed boolean proxy */
  every(predicate: (item: TypedPathProxy<ElemOf<T>>) => unknown): TypedPathProxy<boolean>;
  /** Array `.filter((itemProxy) => cond)` returning a typed array proxy */
  filter(predicate: (item: TypedPathProxy<ElemOf<T>>) => unknown): TypedPathProxy<T>;
  /** Array `.map((itemProxy) => shape)` returning a typed mapped array proxy */
  map<R>(mapper: (item: TypedPathProxy<ElemOf<T>>) => R): TypedPathProxy<R[]>;
  [key: string]: any;
}

/**
 * Recursive TypeScript proxy type that reflects the properties of model T
 * while resolving each property access to its runtime AST expression path string.
 */
export type TypedPathProxy<T> = (T extends (...args: any[]) => any
  ? (...args: Parameters<T>) => ReturnType<T>
  : T extends ReadonlyArray<infer U>
  ? { [index: number]: TypedPathProxy<U>; length: TypedPathProxy<number> }
  : T extends object
  ? {
      [K in keyof T]-?: TypedPathProxy<NonNullable<T[K]>>;
    }
  : {}) &
  ProxyExprMethods<T>;

function formatLiteral(val: unknown): string {
  if (isPathProxy(val)) return String(val);
  if (typeof val === 'string') {
    if (val.startsWith('$') || val.startsWith('(') || val.startsWith('{{') || val.startsWith('__item')) return val;
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

/**
 * Checks whether an object or value recursively contains at least one TypedPathProxy.
 */
export function containsPathProxy(val: unknown): boolean {
  if (isPathProxy(val)) return true;
  if (Array.isArray(val)) return val.some(containsPathProxy);
  if (val && typeof val === 'object' && !(val instanceof RegExp) && !(val instanceof Date)) {
    return Object.values(val).some(containsPathProxy);
  }
  return false;
}

let lambdaDepth = 0;

function serializeProxyReturn(val: unknown): string {
  if (isPathProxy(val)) return String(val);
  if (Array.isArray(val)) {
    return `[${val.map(serializeProxyReturn).join(', ')}]`;
  }
  if (val && typeof val === 'object' && !(val instanceof RegExp) && !(val instanceof Date)) {
    const entries = Object.entries(val).map(([k, v]) => `${JSON.stringify(k)}: ${serializeProxyReturn(v)}`);
    return `({ ${entries.join(', ')} })`;
  }
  return formatLiteral(val);
}

function runItemLambda(fn: (item: any) => unknown): { varName: string; bodyStr: string } {
  const varName = lambdaDepth === 0 ? '__item' : `__item${lambdaDepth}`;
  lambdaDepth++;
  try {
    const itemProxy = createContextProxy(varName);
    const res = fn(itemProxy);
    return { varName, bodyStr: serializeProxyReturn(res) };
  } finally {
    lambdaDepth--;
  }
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
  'toBoolean',
  'nonEmpty',
  'upper',
  'lower',
  'trim',
  'ternary',
  'isChoice',
  'isCommand',
  'in',
  'optional',
  'subTemplate',
  'find',
  'findBy',
  'some',
  'someBy',
  'every',
  'filter',
  'map',
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
    orDefault: (fallback: unknown) => createContextProxy(`(${paren(root)} || ${formatLiteral(fallback)})`),
    and: (other: unknown) => createContextProxy(`(${paren(root)} and ${other})`),
    or: (other: unknown) => createContextProxy(`(${paren(root)} or ${other})`),
    not: () => createContextProxy(`not ${paren(root)}`),
    isTruthy: () => createContextProxy(`Boolean(${root})`),
    isFalsy: () => createContextProxy(`not ${paren(root)}`),
    toBoolean: () => createContextProxy(`Boolean(${root})`),
    nonEmpty: () => createContextProxy(`Boolean(${paren(root)} && String(${root}).trim())`),
    upper: () => createContextProxy(`String(${paren(root)} || '').toUpperCase()`),
    lower: () => createContextProxy(`String(${paren(root)} || '').toLowerCase()`),
    trim: () => createContextProxy(`String(${paren(root)} || '').trim()`),
    ternary: (whenTrue: unknown, whenFalse: unknown) =>
      createContextProxy(`(${paren(root)} ? ${formatLiteral(whenTrue)} : ${formatLiteral(whenFalse)})`),
    isChoice: (id: string) =>
      createContextProxy(`(${root}.id == '${id}' or ${root} == '${id}' or ${root}.value == '${id}')`),
    isCommand: (type: string) =>
      createContextProxy(`((${root} && ${root}.type == '${type}') || ${root} == '${type}')`),
    in: (...values: unknown[]) =>
      createContextProxy(`(${values.map((v) => `${paren(root)} == ${formatLiteral(v)}`).join(' or ')})`),
    optional: () => `{${root}?}`,
    subTemplate: (other: unknown) => `{${root} - ${other}?}`,
    find: (predicate: (item: any) => unknown) => {
      const { varName, bodyStr } = runItemLambda(predicate);
      return createContextProxy(`(${paren(root)} || []).find((${varName}) => ${bodyStr})`);
    },
    findBy: (key: string, value: unknown) =>
      createContextProxy(`(${paren(root)} || []).find((__item) => __item.${key} == ${formatLiteral(value)})`),
    some: (predicate: (item: any) => unknown) => {
      const { varName, bodyStr } = runItemLambda(predicate);
      return createContextProxy(`(${paren(root)} || []).some((${varName}) => ${bodyStr})`);
    },
    someBy: (key: string, value: unknown) =>
      createContextProxy(`(${paren(root)} || []).some((__item) => __item.${key} == ${formatLiteral(value)})`),
    every: (predicate: (item: any) => unknown) => {
      const { varName, bodyStr } = runItemLambda(predicate);
      return createContextProxy(`(${paren(root)} || []).every((${varName}) => ${bodyStr})`);
    },
    filter: (predicate: (item: any) => unknown) => {
      const { varName, bodyStr } = runItemLambda(predicate);
      return createContextProxy(`(${paren(root)} || []).filter((${varName}) => ${bodyStr})`);
    },
    map: (mapper: (item: any) => unknown) => {
      const { varName, bodyStr } = runItemLambda(mapper);
      return createContextProxy(`(${paren(root)} || []).map((${varName}) => ${bodyStr})`);
    },
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
 * Creates a context proxy suitable for evaluating `(ctx) => ...` callbacks at build time:
 * `ctx.state` resolves to `$state`, `ctx.params` to `$params`, `ctx.$actor` to `$actor`,
 * and any other `ctx.foo` to `$context.foo`.
 */
export function createCallbackContextProxy<T = any>(defaultRoot = '$context'): TypedPathProxy<T> {
  const base = createContextProxy<T>(defaultRoot);
  return new Proxy(base as any, {
    get(target, prop: string | symbol, receiver) {
      if (prop === 'state') return createContextProxy('$state');
      if (prop === 'params') return createContextProxy('$params');
      if (prop === '$actor') return createContextProxy('$actor');
      if (prop === '$config') return createContextProxy('$config');
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Declarative condition helpers for building expressions without raw string concatenation.
 */
export const not = (expr: unknown): string => `!(${expr})`;
export const and = (...exprs: unknown[]): string => exprs.map((e) => `(${e})`).join(' && ');
export const or = (...exprs: unknown[]): string => exprs.map((e) => `(${e})`).join(' || ');
export const eq = (a: unknown, b: unknown): string => `(${a} === ${typeof b === 'string' ? `'${b}'` : JSON.stringify(b)})`;
