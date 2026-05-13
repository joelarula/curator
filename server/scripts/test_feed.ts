import { Pipeline } from '../src/services/ast/builder.js';
import { VOCAB } from '../src/constants/vocabulary.js';
import type { ProcessFeedOutput } from '../src/services/tools/types.js';

const pipeline = new Pipeline();

// 1. Process Feed
const feedData = pipeline.tool<ProcessFeedOutput>('process_feed', { 
    url: "http://uudised.err.ee/uudised_rss.php" 
});

// 2. Iterate through extracted FeedItems
pipeline.forEach(feedData.items, (item, itemFlow) => {
    
    // We statically know feedData contains 'data.feed' because of ProcessFeedOutput typing!
    const feedResource = feedData.data.feed;
    
    itemFlow.tool('upsert_resource', {
        uri: item.link,
        title: item.title,
        description: item.content,
        type: VOCAB.TYPE.article,
        status: VOCAB.STATUS.draft,
        language: VOCAB.LANGUAGES.estonian,
        isPublished: false
    });

    itemFlow.tool('upsert_relation', {
        subjectUri: feedResource.uri,
        predicateUri: VOCAB.PROP.provider,
        objectUri: item.link
    });

    // 3. Iterate through internal tags array
    itemFlow.forEach(item.categories, (category, catFlow) => {
        catFlow.tool('upsert_relation', {
            subjectUri: item.link,
            predicateUri: "err:about",
            objectUri: `err:${category}`
        });
    });
});

export default pipeline;