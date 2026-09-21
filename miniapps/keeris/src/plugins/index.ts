import { curatorEngine, corePlugin, type CuratorEngine } from '@curator/agent-server';
import { createErrRadioPlugin } from './err-radio.ts';
import { keerisDomainPlugin } from './keeris-domain.ts';

let registered = false;

export async function registerKeerisPlugins({ db }: { db?: any } = {}): Promise<CuratorEngine> {
  if (registered) return curatorEngine;

  curatorEngine.registerPlugin(corePlugin);
  curatorEngine.registerPlugin(keerisDomainPlugin as any);
  curatorEngine.registerPlugin(createErrRadioPlugin(db) as any);

  registered = true;
  return curatorEngine;
}
