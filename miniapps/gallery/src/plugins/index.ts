import { curatorEngine, corePlugin, type CuratorEngine } from '@curator/agent-server';
import { createStoragePlugin } from '@curator/plugin-storage';
import { createImagePlugin } from '@curator/plugin-image';
import { createGalleryPlugin, galleryScripts } from './galleryPlugin.ts';
import { createGalleryTools, type GalleryToolsDeps } from './galleryTools.ts';

export { createGalleryPlugin, galleryScripts, createGalleryTools, type GalleryToolsDeps };

/**
 * Registers all Curator plugins required by the Gallery MiniApp:
 * 1. `corePlugin` (system tools & workflows)
 * 2. `createStoragePlugin` (`@curator/plugin-storage` VM file storage tools)
 * 3. `createImagePlugin` (`@curator/plugin-image` Sharp/fallback image tools)
 * 4. `miniapp:gallery` (domain gallery tools, AST workflows, roles, and scheduled agents)
 */
export function registerGalleryPlugins(deps: GalleryToolsDeps): CuratorEngine {
  const { plugin: storagePlugin } = createStoragePlugin({ storageService: deps.storage });
  const { plugin: imagePlugin } = createImagePlugin({ imageProcessor: deps.imageProcessor });
  const galleryPlugin = createGalleryPlugin(deps);

  curatorEngine.registerPlugin(corePlugin);
  curatorEngine.registerPlugin(storagePlugin);
  curatorEngine.registerPlugin(imagePlugin);
  curatorEngine.registerPlugin(galleryPlugin);

  return curatorEngine;
}
