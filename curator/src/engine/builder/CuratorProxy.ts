/**
 * Fluent expression methods available on every TypedPathProxy node.
 * Enables concise, IDE-autocompleted AST expressions without fragile string interpolation.
 */
export interface ProxyExprMethods<T = any> {
  (): string;
  toString(): string;
  valueOf(): string;
  toJSON(): string;
  /** `(path == val)` */
  eq(val: unknown): TypedPathProxy<boolean>;
  /** `(path != val)` */
  ne(val: unknown): TypedPathProxy<boolean>;
  /** `(path > val)` */
  gt(val: number | string | TypedPathProxy<any>): TypedPathProxy<boolean>;
  /** `(path >= val)` */
  gte(val: number | string | TypedPathProxy<any>): TypedPathProxy<boolean>;
  /** `(path < val)` */
  lt(val: number | string | TypedPathProxy<any>): TypedPathProxy<boolean>;
  /** `(path <= val)` */
  lte(val: number | string | TypedPathProxy<any>): TypedPathProxy<boolean>;
  /** `((path) + val)` */
  add(val: number | string | TypedPathProxy<any>): TypedPathProxy<number>;
  /** `((path) - val)` */
  sub(val: number | string | TypedPathProxy<any>): TypedPathProxy<number>;
  /** `((path) || fallback)` */
  orDefault<D = T>(fallback: D | string | TypedPathProxy<any>): TypedPathProxy<T>;
  /** `((path) && (other))` */
  and(other: unknown): TypedPathProxy<boolean>;
  /** `((path) || (other))` */
  or(other: unknown): TypedPathProxy<boolean>;
  /** `!(path)` */
  not(): TypedPathProxy<boolean>;
  /** `Boolean(path)` */
  isTruthy(): TypedPathProxy<boolean>;
  /** `!(path)` */
  isFalsy(): TypedPathProxy<boolean>;
  /** Matches a choice answer `{ id, value }` or bare string against one or more option ids. */
  isChoice(...ids: string[]): TypedPathProxy<boolean>;
  /** Matches a command `{ type }` or bare string against one or more command types. */
  isCommand(...types: string[]): TypedPathProxy<boolean>;
  /** Checks whether `path` is one of `values`. */
  in(values: readonly unknown[]): TypedPathProxy<boolean>;
  /** Safe optional-chained template placeholder `{path?}` for agent prompts/instructions. */
  optional(): string;
  [key: string]: any;
}

/**
 * Recursive TypeScript proxy type that reflects the properties of model T
 * while resolving each property access to its runtime AST expression path string.
 */
export type TypedPathProxy<T = any> = (T extends (...args: any[]) => any
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

function formatOperand(val: unknown): string {
  if (isPathProxy(val)) return String(val);
  if (typeof val === 'string') {
    if (val.startsWith('$') || val.startsWith('(') || val.startsWith('!')) return val;
    return JSON.stringify(val);
  }
  return JSON.stringify(val);
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

const PROXY_METHODS: Record<string, (root: string) => (...args: any[]) => any> = {
  eq: (root) => (val: unknown) => createContextProxy<boolean>(`(${root} == ${formatOperand(val)})`),
  ne: (root) => (val: unknown) => createContextProxy<boolean>(`(${root} != ${formatOperand(val)})`),
  gt: (root) => (val: unknown) => createContextProxy<boolean>(`(${root} > ${formatOperand(val)})`),
  gte: (root) => (val: unknown) => createContextProxy<boolean>(`(${root} >= ${formatOperand(val)})`),
  lt: (root) => (val: unknown) => createContextProxy<boolean>(`(${root} < ${formatOperand(val)})`),
  lte: (root) => (val: unknown) => createContextProxy<boolean>(`(${root} <= ${formatOperand(val)})`),
  add: (root) => (val: unknown) => createContextProxy<number>(`((${root}) + ${formatOperand(val)})`),
  sub: (root) => (val: unknown) => createContextProxy<number>(`((${root}) - ${formatOperand(val)})`),
  orDefault: (root) => (fallback: unknown) => createContextProxy(`(${root} || ${formatOperand(fallback)})`),
  and: (root) => (other: unknown) => createContextProxy<boolean>(`((${root}) && (${other}))`),
  or: (root) => (other: unknown) => createContextProxy<boolean>(`((${root}) || (${other}))`),
  not: (root) => () => createContextProxy<boolean>(`!(${root})`),
  isTruthy: (root) => () => createContextProxy<boolean>(`Boolean(${root})`),
  isFalsy: (root) => () => createContextProxy<boolean>(`!(${root})`),
  isChoice: (root) => (...ids: string[]) => {
    const clauses = ids.map((id) => `(${root} && (${root}.id == '${id}' || ${root} == '${id}' || ${root}.value == '${id}'))`);
    return createContextProxy<boolean>(clauses.length === 1 ? clauses[0] : `(${clauses.join(' || ')})`);
  },
  isCommand: (root) => (...types: string[]) => {
    const clauses = types.map((t) => `((${root} && ${root}.type == '${t}') || ${root} == '${t}')`);
    return createContextProxy<boolean>(clauses.length === 1 ? clauses[0] : `(${clauses.join(' || ')})`);
  },
  in: (root) => (values: readonly unknown[]) => {
    const clauses = (values || []).map((v) => `${root} == ${formatOperand(v)}`);
    return createContextProxy<boolean>(clauses.length ? `(${clauses.join(' || ')})` : 'false');
  },
  optional: (root) => () => `{${root}?}`,
};

/**
 * Creates a typed recursive proxy that resolves property paths to AST expressions.
 * e.g. ctx.gameState.currentStreet => "$context.gameState.currentStreet"
 */
export function createContextProxy<T = any>(root = '$context'): TypedPathProxy<T> {
  const targetObj = Object.assign(() => root, {
    toJSON: () => root,
    toString: () => root,
    valueOf: () => root,
    __isPathProxy: true,
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
      if (strProp in PROXY_METHODS) {
        return PROXY_METHODS[strProp](root);
      }
      // Bracket indexing if numeric index or dynamic expression path
      if (/^\d+$/.test(strProp)) {
        return createContextProxy(`${root}[${strProp}]`);
      }
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
export const not = (expr: unknown): TypedPathProxy<boolean> => createContextProxy<boolean>(`!(${expr})`);
export const and = (...exprs: unknown[]): TypedPathProxy<boolean> =>
  createContextProxy<boolean>(exprs.map((e) => `(${e})`).join(' && '));
export const or = (...exprs: unknown[]): TypedPathProxy<boolean> =>
  createContextProxy<boolean>(exprs.map((e) => `(${e})`).join(' || '));
export const eq = (a: unknown, b: unknown): TypedPathProxy<boolean> =>
  createContextProxy<boolean>(`(${a} === ${formatOperand(b)})`);
