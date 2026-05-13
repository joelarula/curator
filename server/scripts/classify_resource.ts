import { Pipeline } from '../src/services/ast/builder.js';
import { VOCAB } from '../src/constants/vocabulary.js';

/**
 * Decomposed Resource Classification Script
 * Re-written using the new Phase 4 Typed Pipeline DSL.
 */

const pipeline = new Pipeline();

// 1. Fetch target resources
const resources = pipeline.tool('query_resources', {
    status: 'DRAFT',
    type: 'ARTICLE',
    excludeRelation: {
        predicateUri: VOCAB.DC.subject,
        objectUriContains: 'udc:'
    },
    limit: 1
});

// 2. Iterate through found articles
pipeline.forEach(resources.items, (articleRef, articleFlow) => {
    
    // Refresh with full relations
    const article = articleFlow.tool('get_resource', { id: articleRef.id });

    articleFlow.forEach(article.items, (fullArticle, innerFlow) => {
        
        // Extract existing ERR tags
        const cats = innerFlow.tool('select_objects', { items: fullArticle.subjectRelations, predicateUri: 'err:about' });
        
        // Format them as a comma-separated string
        const categoryNames = innerFlow.tool('format_list', {
            items: cats.data,
            template: '{{title}}',
            separator: ', '
        });

        // 3. Spawn a detached background process for LLM execution
        innerFlow.spawn((spawnFlow) => {
            
            // Define prompt using native JS template literals!
            const prompt = 
`Classify the following Estonian text into one or more UDC (Universal Decimal Classification) categories.
Return ONLY a valid JSON list of objects, each containing:
- "code": The UDC notation (e.g. "133.52")
- "title_en": A brief description of the category in English.
- "title_et": A brief description of the category in Estonian.
- "justification": A brief explanation (in Estonian) why this category applies to the text.

TEXT TO CLASSIFY:
Title: ${fullArticle.title}
Description: ${fullArticle.description}
Source Categories: ${categoryNames.data}`;

            const llmResponse = spawnFlow.tool('ask_llm', {
                prompt: prompt,
                output: "LIST",
                model: "gemini-3.1-flash-lite"
            });

            // 4. Iterate over LLM structured output
            spawnFlow.forEach(llmResponse.items, (item, itemFlow) => {
                
                // Create Semantic UDC Node
                itemFlow.tool('upsert_resource', {
                    uri: `udc:${item.code}`,
                    title: item.title_et,
                    type: VOCAB.TYPE.udcCategory
                });

                // Link Article to UDC Node
                itemFlow.tool('upsert_relation', {
                    subjectUri: fullArticle.uri,
                    predicateUri: VOCAB.DC.subject,
                    objectUri: `udc:${item.code}`,
                    justification: item.justification
                });
            });
        });
    });
});

export default pipeline;
