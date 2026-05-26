import { Pipeline } from '../src/services/ast/builder.js';

/**
 * Match and Save Feed Articles Agent
 * 
 * This script crawls a live RSS feed, asks the LLM to extract a structured JSON list 
 * of articles matching specific criteria (nature, science, technology), and then 
 * loops over the LLM output to save (upsert) them directly into the database.
 */
function createUpsertMatchedPipeline(): Pipeline {
    const pipeline = new Pipeline({
        meta: {
            agent: "ERR-Match-And-Save-Agent",
            purpose: "Filter ERR feed items using LLM and upsert matches to database"
        },
        context: {
            feedUrl: "http://uudised.err.ee/uudised_rss.php",
            feedLimit: 15,
            criteria: "nature, technology, science, or environment"
        }
    });

    // 1. Fetch live RSS feed items
    const feedData = pipeline.tool('process_feed', {
        url: pipeline.context.feedUrl,
        limit: pipeline.context.feedLimit
    });

    // 2. Format feed items so the LLM can easily read them
    const formatData = pipeline.tool('format_list', {
        items: feedData.items,
        template: "URI: {{link}}\nTitle: {{title}}\nSnippet: {{contentSnippet}}"
    });

    // 3. Ask the LLM to filter articles matching the criteria and return structured JSON
    const llmResponse = pipeline.tool('ask_llm', {
        prompt: `
            You are a curation assistant. Read the following news articles carefully.
            
            ARTICLES:
            ${formatData.data}
            
            TASK:
            Filter the articles and select ONLY those that are related to: ${pipeline.context.criteria}.
            
            Return a valid JSON list of selected articles. Each object in the list MUST have:
            - "uri": The exact matching URI (link) from the article.
            - "title": The exact title of the article.
            - "description": A brief summary of the article's core topic in English.
            
            Do not include any formatting other than a clean, valid JSON array.
        `,
        output: "LIST", // Enforces structured JSON array output mapped to item fields
        model: "gemini-3.1-flash-lite"
    });

    // 4. Iterate over the structured JSON list returned by the LLM
    pipeline.forEach(llmResponse.items, (item, flow) => {
        // Save the matched article as a Resource in the database
        flow.tool('upsert_resource', {
            uri: item.uri,
            title: item.title,
            description: item.description,
            type: 'ARTICLE',
            isPublished: true
        });

        // Debug message log
        flow.tool('debug', {
            message: "Successfully matched and saved resource: {{item.title}} (URI: {{item.uri}})"
        });
    });

    return pipeline;
}

const pipeline = createUpsertMatchedPipeline();
export default pipeline;
