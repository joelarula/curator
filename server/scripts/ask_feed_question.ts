import { Pipeline } from '../src/services/ast/builder.js';

/**
 * Dynamic Feed Questioner Pipeline
 * 
 * This generic script encapsulates its entire pipeline construction logic inside a closure
 * (function), uses the `context` configuration object on the Pipeline class, and dynamically
 * injects the `context.prompt` question to run over the processed ERR RSS feed.
 */
function createFeedQuestionPipeline(): Pipeline {
    const pipeline = new Pipeline({
        meta: {
            agent: "Dynamic-Feed-Questioner",
            purpose: "Extract news from ERR feed and answer a dynamic user question"
        },
        context: {
            feedUrl: "http://uudised.err.ee/uudised_rss.php",
            feedLimit: 10,
            prompt: "Find me news stories which are about nature, technology or science. Provide their titles and  summarize each of them in one sentence."
        }
    });

    // 1. Crawl the news feed dynamically
    const feedData = pipeline.tool('process_feed', {
        url: pipeline.context.feedUrl,
        limit: pipeline.context.feedLimit
    });

    // 2. Format all feed items into a clean textual list
    const formatData = pipeline.tool('format_list', {
        items: feedData.items,
        template: "- {{title}}: {{contentSnippet}}"
    });

    // 3. Pose the dynamic question (context.prompt) over the formatted data
    pipeline.tool('ask_llm', {
        prompt: `
            You are an expert news analyst. Below is a compilation of live RSS news feed items from ERR.
            
            FEED ITEMS:
            ${formatData.data}
            
            TASK:
            ${pipeline.context.prompt}
        `
    });

    return pipeline;
}

// Instantiate and export the pipeline as the default export
const pipeline = createFeedQuestionPipeline();
export default pipeline;
