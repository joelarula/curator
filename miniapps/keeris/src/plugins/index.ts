import { curatorEngine, corePlugin, type CuratorEngine } from '@curator/agent-server';
import { createErrRadioPlugin } from './err-radio.ts';
import { keerisDomainPlugin } from './keeris-domain.ts';
import { keerisPlugin } from './keerisPlugin.ts';

export * from './keerisTools.ts';
export * from './manifest.ts';
export * from './keerisPlugin.ts';

let registered = false;

export async function registerKeerisPlugins({ db }: { db?: any } = {}): Promise<CuratorEngine> {
  if (registered) return curatorEngine;

  curatorEngine.registerPlugin(corePlugin);
  curatorEngine.registerPlugin(keerisPlugin as any);
  curatorEngine.registerPlugin(keerisDomainPlugin as any);
  curatorEngine.registerPlugin(createErrRadioPlugin(db) as any);

  registered = true;
  return curatorEngine;
}
