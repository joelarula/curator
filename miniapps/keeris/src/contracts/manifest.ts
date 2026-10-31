import type { CuratorAppManifest } from '@curator/host/contracts';
import { KeerisConstant } from '../models/keerisContracts.ts';

/**
 * Standard manifest identifying Keeris and declaring host requirements.
 */
export const keerisManifest: CuratorAppManifest = {
  id: KeerisConstant.APP_ID,
  name: 'Curator Keeris Music & Radio Archive',
  version: '2.0.0',
  description: 'Automated ERR Radio broadcast scraper and unique music track catalog with direct REPL and GraphQL APIs',
  requiredHostCapabilities: [
    'ast:v2',
    'storage:sqlite',
    'storage:mariadb',
    'channel:repl',
    'channel:direct',
    'channel:websocket',
  ],
};

