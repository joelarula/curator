import { createKeerisHost } from './host.ts';

export interface StartCuratorRuntimeOptions {
  databaseName?: string;
  keerisDb?: any;
  intervalMs?: number;
  logger?: { log: (...args: any[]) => void; error: (...args: any[]) => void };
}

export async function startCuratorRuntime(options: StartCuratorRuntimeOptions = {}) {
  const host = await createKeerisHost({
    domainDb: options.keerisDb,
    intervalMs: options.intervalMs ?? 5000,
  });

  await host.start(options.intervalMs ?? 5000);
  options.logger?.log?.('[Keeris] Curator host and RequestProcessor active.');

  return host;
}
