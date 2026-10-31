import { defineMiniApp, type MiniAppContract } from '@curator/host/contracts';
import { keerisManifest } from './manifest.ts';
import { KeerisRole } from '../models/keerisContracts.ts';

/**
 * Standard declaration contract for Keeris MiniApp.
 */
export const keerisAppContract: MiniAppContract = defineMiniApp({
  manifest: keerisManifest,
  roles: [KeerisRole.ADMIN, KeerisRole.CURATOR, KeerisRole.VIEWER],
});

