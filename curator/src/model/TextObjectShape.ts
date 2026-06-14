import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const TextObjectShape: SemanticNodeShape = {
    uri: 'schema:TextObjectShape',
    targetClass: 'schema:TextObject',
    name: 'Text Object',
    description: 'A text file or inline text payload, typically localized.',
    properties: {
        textValue: { 
            path: 'schema:textValue', 
            name: 'Text Value',
            description: 'The textual content of this object.',
            datatype: 'curator:textBlob', 
            minCount: 1, 
            maxCount: 1 
        },
        inLanguage: { 
            path: 'schema:inLanguage', 
            name: 'In Language',
            description: 'The language of the content or performance.',
            class: 'schema:Language', 
            minCount: 1, 
            maxCount: 1 
        },
        mentions: {
            path: 'schema:mentions',
            name: 'Mentions',
            description: 'Indicates that the text object mentions or links to another resource.',
            class: 'rdfs:Resource'
        }
    }
};
