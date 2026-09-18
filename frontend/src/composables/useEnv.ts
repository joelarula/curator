export const isExtensionContext = (): boolean => {
  const c = (globalThis as any).chrome;
  return typeof c !== 'undefined' && !!c.runtime && !!c.runtime.sendMessage;
};

export const isStaticWasmContext = (): boolean => {
  const metaEnv = (import.meta as any).env;
  return metaEnv?.VITE_STATIC_WASM === 'true' ||
         Boolean((globalThis as any).__CURATOR_STATIC_WASM__) ||
         localStorage.getItem('curator_runtime_mode') === 'wasm';
};
