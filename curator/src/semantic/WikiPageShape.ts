import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const WikiPageShape: SemanticNodeShape = {
    uri: 'wiki:WikiPageShape',
    targetClass: 'wiki:WikiPage',
    name: 'Wiki Page',
    description: 'A page in a wiki system, providing collaborative content editing.',
    properties: {
        title: { 
            path: 'schema:headline', 
            name: 'Title',
            description: 'The title of the wiki page.',
            datatype: 'xsd:string', 
            minCount: 1, 
            maxCount: 1 
        },
        content: { 
            path: 'wiki:content', 
            name: 'Content',
            description: 'The full text content of the wiki page.',
            datatype: 'curator:textBlob', 
            maxCount: 1 
        },
        author: { path: 'wiki:author', class: 'schema:Person' },
        lastModified: { path: 'wiki:lastModified', datatype: 'xsd:dateTime', maxCount: 1 },
        linksTo: { path: 'wiki:linksTo', class: 'wiki:WikiPage' }
    }
};
