import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const LanguageShape: SemanticNodeShape = {
    uri: 'schema:LanguageShape',
    targetClass: 'schema:Language',
    name: 'Language',
    description: 'Natural languages such as Spanish, Zulu, or Japanese.',
    properties: {
        name: { 
            path: 'schema:name', 
            name: 'Name',
            description: 'The name of the language.',
            datatype: 'xsd:string', 
            minCount: 1, 
            maxCount: 1 
        },
        alternateName: { 
            path: 'schema:alternateName', 
            name: 'Alternate Name',
            description: 'An alias or language code (e.g. "en").',
            datatype: 'xsd:string', 
            maxCount: 1 
        }
    }
};
