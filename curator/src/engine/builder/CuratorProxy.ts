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
  : {}) & {
  (): string;
  toString(): string;
  valueOf(): string;
  toJSON(): string;
  [key: string]: any;
};

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
 * Creates a typed recursive proxy that resolves property paths to AST expressions.
 * e.g. ctx.gameState.currentStreet => "$context.gameState.currentStreet"
 */
export function createContextProxy<T = any>(root = '$context'): TypedPathProxy<T> {
  const targetObj = {
    toJSON: () => root,
    toString: () => root,
    valueOf: () => root,
  };
  const handler: ProxyHandler<any> = {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;
      const strProp = String(prop);
      if (strProp === 'toString' || strProp === 'valueOf' || strProp === 'toJSON') {
        return () => root;
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
