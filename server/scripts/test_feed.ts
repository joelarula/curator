import { Pipeline } from '../src/services/ast/builder.js';
import { VOCAB } from '../src/constants/vocabulary.js';
import { TOOLS } from '../src/services/tools/manifest.js';
import type { ProcessFeedOutput } from '../src/services/tools/types.js';

const pipeline = new Pipeline();

// 1. Process Feed
const feedData = pipeline.tool<ProcessFeedOutput>(TOOLS.PROCESS_FEED, { 
    url: "http://uudised.err.ee/uudised_rss.php",
    excludedUrlPatterns: ['sport.err.ee']
    // We intentionally do not use excludedCategories here, so that we can 
    // handle the filtering explicitly in the itemFlow below!
});

// 2. Iterate through extracted FeedItems
pipeline.forEach(feedData.items, (item, itemFlow) => {

    // First: Evaluate if the item contains any of our excluded categories.
    // evaluate_condition allows us to run synchronous JS logic inside the AST flow!
    const condition = itemFlow.tool<{ result: boolean }>(TOOLS.EVALUATE_CONDITION, {
        evalFn: (data: any) => !['Viipekeelsed', 'ilm', 'uudised', 'ETV uudised','Raadiouudised'].some(c => (data.categories || []).includes(c)),
        data: item
    });
    
    // We only proceed if the condition evaluates to true
    itemFlow.if(condition.result, (allowedFlow) => {
        
        // We statically know feedData contains 'data.feed' because of ProcessFeedOutput typing!
        const feedResource = feedData.data.feed;
        
        // THEN Upserting Resource
        allowedFlow.tool(TOOLS.UPSERT_RESOURCE, {
            uri: item.uri,
            title: item.title,
            description: item.content,
            type: VOCAB.TYPE.article,
            status: VOCAB.STATUS.draft,
            language: VOCAB.LANGUAGES.estonian,
            isPublished: false
        });

        allowedFlow.tool(TOOLS.UPSERT_RELATION, {
            subjectUri: feedResource.uri,
            predicateUri: VOCAB.PROP.provider,
            objectUri: item.uri
        });

        // 3. Iterate through internal tags array
        allowedFlow.forEach(item.categories, (category, catFlow) => {
            catFlow.tool(TOOLS.UPSERT_RELATION, {
                subjectUri: item.uri,
                predicateUri: VOCAB.PROP.about,
                objectUri: `err:${category}`
            });
        });
        
    });
});

export default pipeline;