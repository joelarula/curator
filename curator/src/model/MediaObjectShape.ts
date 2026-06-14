import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const MediaObjectShape: SemanticNodeShape = {
    uri: 'schema:MediaObjectShape',
    targetClass: 'schema:MediaObject',
    name: 'Media Object',
    description: 'An image, video, audio, or general file attachment.',
    properties: {
        contentUrl: { 
            path: 'schema:contentUrl', 
            name: 'Content URL',
            description: 'Actual bytes of the media object, usually a URL.',
            datatype: 'xsd:string',
            pattern: '^https?://', // Using regex validation constraint
            maxCount: 1 
        },
        encodingFormat: { 
            path: 'schema:encodingFormat', 
            name: 'Encoding Format',
            description: 'MIME type of the content (e.g., image/jpeg).',
            datatype: 'xsd:string',
            maxCount: 1 
        },
        contentSize: { 
            path: 'schema:contentSize', 
            name: 'Content Size',
            description: 'File size in bytes.',
            datatype: 'xsd:integer',
            maxCount: 1 
        }
    }
};
