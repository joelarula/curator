import { AIQ } from '../src/services/AIQ.js';
import type { FeedItem, AIQContext } from '../src/services/tools/types.js';


AIQ.chain("process_feed", { url: "http://uudised.err.ee/uudised_rss.php" })
    .onItem().chain<FeedItem>((item, context: AIQContext) => {
        return AIQ.chain("upsert_resource", {
            uri: item.link,
            title: item.title,
            description: item.content,
            type: AIQ.VOCAB.TYPE.article,
            status: AIQ.VOCAB.STATUS.draft,
            language: AIQ.VOCAB.LANGUAGES.estonian,
            isPublished: false
        }).chain("upsert_relation", {
            subjectUri: context.feed!.uri, // Typed reference to the feed resource URI
            predicateUri: AIQ.VOCAB.PROP.provider,
            objectUri: item.link
        }).foreach(item.categories).chain<string>((category) => {
            return AIQ.chain("upsert_relation", {
                subjectUri: item.link,
                predicateUri: "err:about",
                objectUri: `err:${category}` // The category string from the array
            });
        });
    });