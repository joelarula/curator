import { Pipeline } from '../src/services/ast/builder.js';

/**
 * Structured Decision Curation Agent
 * 
 * Logic:
 * 1. Crawl the live ERR RSS feed.
 * 2. Ask the LLM to make a routing decision for each article:
 *    - 'SAVE': For highly valuable science/tech/nature news.
 *    - 'FLAG': For sensitive/controversial topics needing human review.
 *    - 'IGNORE': For standard daily local news.
 * 3. Loop over the decisions and use `flow.match()` to trigger the corresponding workflows!
 */
function createAgentDecisionPipeline(): Pipeline {
    const pipeline = new Pipeline({
        meta: {
            agent: "Agent-Decision-Router",
            purpose: "Analyze feed items and dynamically decide how to route them using AST branches"
        },
        context: {
            feedUrl: "http://uudised.err.ee/uudised_rss.php",
            feedLimit: 8
        }
    });

    // 1. Fetch live RSS feed items
    const feedData = pipeline.tool('process_feed', {
        url: pipeline.context.feedUrl,
        limit: pipeline.context.feedLimit
    });

    // 2. Format items for the LLM
    const formatData = pipeline.tool('format_list', {
        items: feedData.items,
        template: "URI: {{link}}\nTitle: {{title}}\nSnippet: {{contentSnippet}}"
    });

    // 3. Ask the LLM to analyze the articles and decide which action to take for each
    const llmDecisions = pipeline.tool('ask_llm', {
        prompt: `
            You are a smart content moderation and curation router.
            Analyze the following news feed articles:
            
            ARTICLES:
            ${formatData.data}
            
            TASK:
            For each article, decide on a routing action:
            - Choose 'SAVE' if the article is about science, technology, nature, space, or climate.
            - Choose 'FLAG' if the article mentions military, politics, war, crimes, or security threats.
            - Choose 'IGNORE' if the article is about sports, general local happenings, entertainment, or standard weather.
            
            Return a valid JSON array of objects. Each object MUST have:
            - "uri": The exact URI (link) of the article.
            - "title": The title of the article.
            - "action": Exactly one of: "SAVE", "FLAG", or "IGNORE".
            - "reason": A brief English explanation of your decision.
        `,
        output: "LIST",
        model: "gemini-3.1-flash-lite"
    });

    // 4. Iterate over the dynamic decisions returned by the LLM
    pipeline.forEach(llmDecisions.items, (decision, flow) => {
        
        // --- Branch 1: If action is SAVE ---
        flow.match(decision.action, 'SAVE', (saveBranch) => {
            saveBranch.tool('upsert_resource', {
                uri: decision.uri,
                title: decision.title,
                description: decision.reason,
                type: 'ARTICLE',
                isPublished: true // Auto-publish high-value science/tech content
            });
            saveBranch.tool('debug', {
                message: `🟢 [AGENT SAVE]: Saved and published high-value tech/science article: ${decision.title}`
            });
        });

        // --- Branch 2: If action is FLAG ---
        flow.match(decision.action, 'FLAG', (flagBranch) => {
            flagBranch.tool('upsert_resource', {
                uri: decision.uri,
                title: decision.title,
                description: decision.reason,
                type: 'ARTICLE',
                isPublished: false // Draft mode for human moderator approval
            });
            flagBranch.tool('upsert_relation', {
                subjectUri: decision.uri,
                predicateUri: "err:needsReview",
                objectUri: "status:moderation",
                justification: decision.reason
            });
            flagBranch.tool('debug', {
                message: `⚠️ [AGENT FLAG]: Flagged sensitive article for moderation: ${decision.title} (Reason: ${decision.reason})`
            });
        });

        // --- Branch 3: If action is IGNORE ---
        flow.match(decision.action, 'IGNORE', (ignoreBranch) => {
            ignoreBranch.tool('debug', {
                message: `⚪ [AGENT IGNORE]: Skipped low-priority article: ${decision.title}`
            });
        });
    });

    return pipeline;
}

const pipeline = createAgentDecisionPipeline();
export default pipeline;
