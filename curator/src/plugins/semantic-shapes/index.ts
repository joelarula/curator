import type { CuratorPlugin } from '../../engine/CuratorEngine.js';
import { coreShapes } from '../../model/index.js';

/** Optional semantic model plugin for the built-in knowledge graph shapes. */
export const semanticShapesPlugin: CuratorPlugin = {
  name: 'semantic-shapes',
  models: coreShapes
};
