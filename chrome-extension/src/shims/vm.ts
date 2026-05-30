export function createContext(sandbox: any) {
  return sandbox;
}

export function runInContext(code: string, sandbox: any, options?: any) {
  const keys = Object.keys(sandbox);
  const values = Object.values(sandbox);
  const fn = new Function(...keys, `return ${code}`);
  return fn(...values);
}

export default {
  createContext,
  runInContext
};
