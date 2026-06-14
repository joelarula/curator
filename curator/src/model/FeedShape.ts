import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const FeedShape: SemanticNodeShape = {
    uri: 'type:feed',
    targetClass: 'type:feed',
    name: 'Feed',
    description: 'An RSS or Atom feed',
    properties: {
        title: {
            path: 'schema:name',
            name: 'Title',
            datatype: 'xsd:string',
            minCount: 1,
            maxCount: 1
        },
        description: {
            path: 'schema:description',
            name: 'Description',
            datatype: 'xsd:string',
            maxCount: 1
        },
        items: {
            path: 'schema:hasPart',
            name: 'Items',
            class: 'schema:Article',
            description: 'Articles or items in this feed'
        }
    }
};
