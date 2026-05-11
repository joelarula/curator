import { AIQ } from '../src/services/AIQ.js';

/**
 * scripts/test_complex_search.ts
 *
 * Validates the 'query_resources' tool's ability to perform intersection-based
 * semantic searching.
 *
 * Goal: Find resources that are:
 *   1. Status: DRAFT
 *   2. Related to "Film" via https://schema.org/about
 */

AIQ.chain("query_resources", {
    status: "DRAFT",
    relation: {
        predicateUri: "https://schema.org/about",
        objectUri: "Film"
    },
    limit: 10
});
