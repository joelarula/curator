import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const PersonShape: SemanticNodeShape = {
    uri: 'schema:PersonShape',
    targetClass: 'schema:Person',
    name: 'Person',
    description: 'A person (alive, dead, undead, or fictional).',
    properties: {
        name: { 
            path: 'schema:name', 
            name: 'Name',
            description: 'The name of the person.',
            datatype: 'xsd:string', 
            minCount: 1, 
            maxCount: 1 
        },
        description: { path: 'schema:description', datatype: 'xsd:string', maxCount: 1 },
        email: { 
            path: 'schema:email', 
            name: 'Email Address',
            description: 'Email address of the person.',
            datatype: 'xsd:string',
            pattern: '^[^@]+@[^@]+\\.[^@]+$',
            maxCount: 1 
        },
        knows: { path: 'schema:knows', class: 'schema:Person' },
        authoredArticles: {
            path: 'schema:author',
            name: 'Authored Articles',
            description: 'Articles authored by this person.',
            class: 'schema:Article',
            inverse: true
        }
    }
};
