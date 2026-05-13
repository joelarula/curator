import { Curator } from '../src/services/Curator.js';

/**
 * Fallacy Migration Agent
 * 
 * Purpose: Methodically migrate the Logically Fallacious database into the 
 * Curator Knowledge Studio backbone using a triple-native architecture.
 * 
 * Strategy:
 * 1. Fetch the alphabetical index.
 * 2. Extract link resources using precision jQuery-style selectors (h3 a).
 * 3. Autonomous "Fan-Out" to scrape each fallacy.
 * 4. Store definitions and examples as semantic 'Text' nodes.
 */

// Start the crawl at the alphabetical index
Curator.chain("fetch_html", {
    url: "https://www.logicallyfallacious.com/fallacies"
})
    .onSuccess().chain((html: any) =>
        Curator.extract_resource_links({
            resourceUri: html.uri,
            selector: "h3 a", // Deterministic jQuery-style match for the list
            baseUrl: "https://www.logicallyfallacious.com"
        })
            .onItemExtracted().spawn((link: any) =>
                Curator.scrape_resource({
                    url: link.url,
                    resourceUri: link.url,
                    // Original jQuery style DOM match for precision extraction
                    selectors: {
                        title: "h1",
                        description: "p.description",
                        content: "article",
                        logical_form: ".logical-form",
                        example: ".example"
                    },
                    role: "FALLACY_DEFINITION"
                })
                    .onSuccess().chain("upsert_relation", {
                        subjectUri: link.url,
                        predicateUri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
                        objectUri: "http://schema.org/LogicalFallacy",
                        justification: "Ingested from Logically Fallacious database"
                    })
            )
    )
    .run();
