import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const FolderShape: SemanticNodeShape = {
    uri: 'curator:FolderShape',
    targetClass: 'schema:Collection',
    name: 'Folder',
    description: 'A collection or folder used to organize resources. Folders can be nested and can contain any type of resource.',
    properties: {
        name: { 
            path: 'schema:name', 
            name: 'Name',
            description: 'The name of the folder (e.g. "Pending Review", "Tech News").',
            datatype: 'xsd:string', 
            minCount: 1, 
            maxCount: 1 
        },
        description: { 
            path: 'schema:description', 
            name: 'Description',
            description: 'A description of what belongs in this folder.',
            datatype: 'xsd:string',
            maxCount: 1 
        },
        parentFolder: { 
            path: 'schema:isPartOf', 
            name: 'Parent Folder',
            description: 'The parent folder that contains this folder, used for nesting.',
            class: 'schema:Collection',
            maxCount: 1 
        },
        contains: { 
            path: 'schema:hasPart', 
            name: 'Contains',
            description: 'The resources contained within this folder.',
            class: 'rdfs:Resource'
        }
    }
};
