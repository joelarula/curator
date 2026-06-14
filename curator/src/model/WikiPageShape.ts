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
        linksTo: { path: 'wiki:linksTo', class: 'wiki:WikiPage' },
        keywords: {
            path: 'schema:keywords',
            name: 'Keywords',
            description: 'Keywords or tags used to describe this content.',
            datatype: 'xsd:string'
        },
        parentPage: {
            path: 'schema:isPartOf',
            name: 'Parent Page',
            description: 'The parent wiki page if this page is nested.',
            class: 'wiki:WikiPage',
            maxCount: 1
        },
        subPages: {
            path: 'schema:isPartOf',
            name: 'Sub Pages',
            description: 'Wiki pages nested under this page.',
            class: 'wiki:WikiPage',
            inverse: true
        }
    }
};
