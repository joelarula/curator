import { Pipeline } from '../src/services/ast/builder.js';

/**
 * Hybrid Curation & Generative Execution Agent
 * 
 * Demonstrates the ultimate combination of both architectures:
 * - Uses AST branching (Architecture 1) to classify and route standard vs complex items.
 * - Uses dynamic script generation & sandboxed execution (Architecture 2) to evaluate 
 *   tailored relation mappings for complex articles.
 */
function createHybridAgentPipeline(): Pipeline {
    const pipeline = new Pipeline({
        meta: {
            agent: "Hybrid-Decision-Agent",
            purpose: "Route feed items using AST, and generate/execute dynamic code for complex mappings"
        },
        context: {
            feedUrl: "http://uudised.err.ee/uudised_rss.php",
            feedLimit: 5
        }
    });

    // 1. Process the RSS feed
    const feedData = pipeline.tool('process_feed', {
        url: pipeline.context.feedUrl,
        limit: pipeline.context.feedLimit
    });

    // 2. Format items for the LLM router
    const formatData = pipeline.tool('format_list', {
        items: feedData.items,
        template: "URI: {{link}}\nTitle: {{title}}\nSnippet: {{contentSnippet}}"
    });

    // 3. Ask the LLM to decide on standard vs complex processing
    const llmRouter = pipeline.tool('ask_llm', {
        prompt: `
            Analyze the following news articles:
            
            ARTICLES:
            ${formatData.data}
            
            TASK:
            For each article, decide on a processing track:
            - Choose 'STANDARD' if it's a straightforward article (e.g. sports, simple weather, or general announcements).
            - Choose 'COMPLEX' if it involves political policy, climate bills, infrastructure projects, international relations, or security.
            
            Return a JSON array of objects with the following keys:
            - "uri": The exact URI (link) of the article.
            - "title": The title of the article.
            - "track": Exactly "STANDARD" or "COMPLEX".
            - "summary": A brief English summary.
        `,
        output: "LIST",
        model: "gemini-3.1-flash-lite"
    });

    // 4. Loop over the LLM-routed items
    pipeline.forEach(llmRouter.items, (item, flow) => {

        // === Track A: STANDARD workflow (Architecture 1: Direct Tool calls) ===
        flow.match(item.track, 'STANDARD', (standardBranch) => {
            standardBranch.tool('upsert_resource', {
                uri: item.uri,
                title: item.title,
                description: item.summary,
                type: 'ARTICLE',
                isPublished: true
            });
            standardBranch.tool('debug', {
                message: `🟢 [STANDARD TRACK]: Saved simple article: ${item.title}`
            });
        });

        // === Track B: COMPLEX workflow (Architecture 2: Generative Execution) ===
        flow.match(item.track, 'COMPLEX', (complexBranch) => {
            
            // Step 1: Ask the LLM to write a custom Curator script mapping the complex relations
            const generatedScript = complexBranch.tool('ask_llm', {
                prompt: `
                    You are an expert semantic engineer. Write a complete TypeScript Curator script 
                    to ingest this complex article and establish its relationship graph.
                    
                    ARTICLE DETAILS:
                    Title: ${item.title}
                    URI: ${item.uri}
                    Summary: ${item.summary}
                    
                    REQUIREMENTS:
                    Your output must be a valid, executable TypeScript block that returns a Curator chain.
                    It must:
                    1. Ingest the article resource (type: "ARTICLE").
                    2. Ingest a related semantic tag or concept (e.g., "concept:climate" or "concept:security").
                    3. Link the article to that concept with the predicate "https://schema.org/about".
                    
                    EXAMPLE OUTPUT STRUCTURE:
                    return start()
                      .upsert_resource({ uri: "${item.uri}", title: "${item.title}", type: "ARTICLE" })
                      .upsert_resource({ uri: "concept:policy", title: "Policy & Politics", type: "CONCEPT" })
                      .upsert_relation({ subjectUri: "${item.uri}", predicateUri: "https://schema.org/about", objectUri: "concept:policy" });
                    
                    Return ONLY the raw executable TypeScript code. Do not include markdown code block backticks (like \`\`\`typescript) or comments.
                `,
                model: "gemini-3.1-flash-lite"
            });

            // Step 2: Execute the LLM's custom script dynamically in the sandboxed vm
            complexBranch.tool('execute_script', {
                body: generatedScript.result
            });

            complexBranch.tool('debug', {
                message: `🔥 [COMPLEX TRACK]: Generated and executed dynamic relation mapping for: ${item.title}`
            });
        });
    });

    return pipeline;
}

const pipeline = createHybridAgentPipeline();
export default pipeline;
