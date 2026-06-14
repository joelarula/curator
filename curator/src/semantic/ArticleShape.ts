import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const ArticleShape: SemanticNodeShape = {
    uri: 'schema:ArticleShape',
    targetClass: 'schema:Article',
    name: 'Article',
    description: 'An article, such as a news article or piece of investigative report. Articles are authored and have related content.',
    properties: {
        headline: {
            path: 'schema:headline',
            name: 'Headline',
            description: 'The headline of the article.',
            datatype: 'xsd:string',
            minCount: 1,
            maxCount: 1
        },
        url: {
            path: 'schema:url',
            name: 'URL',
            description: 'The canonical web URL of this resource.',
            datatype: 'xsd:string',
            maxCount: 1
        },
        articleBody: {
            path: 'schema:articleBody',
            name: 'Article Body',
            description: 'The actual body of the article. This points to a localized text object containing the text and language.',
            class: 'schema:TextObject',
            maxCount: 1
        },
        author: {
            path: 'schema:author',
            name: 'Author',
            description: 'The author of this content or rating. Please note that author is special in that HTML 5 provides a special mechanism for indicating authorship via the rel tag. That is equivalent to this and may be used interchangeably.',
            class: 'schema:Person'
        },
        datePublished: {
            path: 'schema:datePublished',
            name: 'Date Published',
            description: 'Date of first broadcast/publication.',
            datatype: 'xsd:dateTime',
            maxCount: 1
        },
        status: {
            path: 'curator:status',
            name: 'Status',
            description: 'The publication status of the article.',
            datatype: 'xsd:string',
            in: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
            minCount: 1,
            maxCount: 1
        }
    }
};
