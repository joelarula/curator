/**
 * Curator Knowledge Studio - High-Fidelity Vocabulary Registry
 * 
 * This file provides type-safe constants for all RDF, Schema.org, and internal
 * semantic terminology as defined in SEMANTIC_IDENTITY.md.
 */

export const RDF = {
    type: 'rdf:type',
} as const;

export const RDFS = {
    label: 'rdfs:label',
} as const;

export const DC = {
    subject: 'dc:subject',
} as const;



export const SCHEMA = {
    about: 'schema:about',
    title: 'schema:title',
    description: 'schema:description',
    provider: 'schema:provider',
    datePublished: 'schema:datePublished',
    author: 'schema:author',
    isPartOf: 'schema:isPartOf',
    inLanguage: 'schema:inLanguage',
} as const;

export const PROP = {
    status: 'prop:status',
    allowsValue: 'prop:allows_value',
    confidence: 'prop:confidence',
    extractionMethod: 'prop:extraction_method',
    justification: 'prop:justification',
    // Schema aliases for ergonomics
    about: SCHEMA.about,
    provider: SCHEMA.provider,
    isPartOf: SCHEMA.isPartOf,
    inLanguage: SCHEMA.inLanguage,
} as const;



export const TYPE = {
    article: 'type:article',
    predicate: 'type:predicate',
    agent: 'type:agent',
    concept: 'type:concept',
    logicalFallacy: 'type:logical_fallacy',
    udcCategory: 'udc:category',
} as const;


export const STATUS = {
    draft: 'status:draft',
    published: 'status:published',
    archived: 'status:archived',
    flagged: 'status:flagged',
} as const;

export const LANGUAGES = {
    estonian: 'lang:et',
    english: 'lang:en',
    russian: 'lang:ru',
} as const;

/**
 * Universal Vocabulary Registry for type-safe lookups.
 */
export const VOCAB = {
    RDF,
    RDFS,
    SCHEMA,
    PROP,
    TYPE,
    STATUS,
    LANGUAGES,
    DC,
} as const;


