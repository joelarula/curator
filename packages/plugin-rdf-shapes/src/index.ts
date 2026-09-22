export * from './SemanticSchemaEngine.js';
export * from './model/index.js';
import { coreShapes } from './model/index.js';

export function rdfShapesPlugin(shapes = coreShapes) {
  return {
    name: 'semantic-shapes',
    version: '1.0.0',
    description: 'Curator RDF triplestore and semantic shapes plugin',
    models: shapes,
    onInit: ({ engine }: any) => {
      shapes.forEach((s: any) => engine.models.set(s.uri, s));
    },
  };
}

export const semanticShapesPlugin = rdfShapesPlugin();
