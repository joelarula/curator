import { createCuratorHost, type CuratorHost } from '../../../packages/host/dist/index.js';
import { curatorEngine } from '../../../curator/dist/src/index.js';
import { demoPlugin } from './plugins/demo.js';

export async function createBlueprintHost(): Promise<CuratorHost> {
  return createCuratorHost({
    name: 'blueprint',
    dataDir: process.env.DATA_DIR ?? './data',
    curatorDb: {
      path: process.env.CURATOR_DATABASE_PATH,
    },
    intervalMs: 3000,
    registerPlugins: async () => {
      curatorEngine.registerPlugin(demoPlugin);
      return curatorEngine;
    },
  });
}
