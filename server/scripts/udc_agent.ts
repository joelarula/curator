import { Curator } from '../src/services/Curator.js';

/**
 * UDC Classification Agent
 * 
 * Logic:
 * 1. Fetch deep resource data.
 * 2. Ask LLM to pick UDC categories (returns JSON array).
 * 3. Fan-out the categories.
 * 4. Map relations to the Knowledge Graph.
 */
const udcAgent = (uri: string) => {
    // 1. Ensure the article exists and has content
    return Curator.chain("upsert_resource", {
        uri,
        title: "Eesti Energia ja turu-uuringute prognoos",
        description: "Eesti Energia ja turu-uuringute prognoosi kohaselt jääb elektrihind lähiajal stabiilseks.",
        type: "ARTICLE",
        language: "et"
    })
    // 2. Fetch it back with relations (to demonstrate deep fetch)
    .chain("get_resource", { uri })
    .onItem().chain((article: any) => {
        return Curator.chain("ask_llm", {

                prompt: `
                    Analyze the following article content and suggest the most relevant Universal Decimal Classification (UDC) categories.
                    
                    Article Title: ${article.title}
                    Article Description: ${article.description}
                    
                    Return ONLY a JSON array of objects like this:
                    [
                        { "code": "33", "title": "Economics" },
                        { "code": "51", "title": "Mathematics" }
                    ]
                `,
                json: true,
                model: "gemini-1.5-flash" // Example model
            }).onSuccess().chain((llmResult: any[]) => {
                // Fan out the results from the LLM
                return Curator.chain("iterate", { items: llmResult })

                    .onItem().chain((category: any) => {
                        const udcUri = `https://udcsummary.info/items/?id=${category.code}`;
                        
                        return Curator.chain("upsert_resource", {
                            uri: udcUri,
                            title: category.title,
                            type: "CONCEPT",
                            status: "ACTIVE"
                        }).chain("upsert_relation", {
                            subjectUri: article.uri,
                            predicateUri: "https://schema.org/about",
                            objectUri: udcUri
                        }).chain("debug", { 
                            message: `Linked article to UDC: ${category.code} (${category.title})` 
                        });
                    });
            });
        });
};

// Export the flow for a specific test URI
export default udcAgent("https://uudised.err.ee/1609337582/eesti-energia-ja-turu-uuringute-prognoos-elektrihind-jaab-stabiilseks");
