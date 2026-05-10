import { AIQ } from '../src/services/AIQ.js';
import type { FeedItem, AIQContext } from '../src/services/tools/types.js';


AIQ.chain("process_feed", { url: "http://uudised.err.ee/uudised_rss.php" })
    .onItem().chain<FeedItem>((item, context: AIQContext) => {
        return AIQ.chain("upsert_resource", {
            uri: item.link,
            title: item.title,
            description: item.content,
            type: "ARTICLE",
            status: "DRAFT",
            language: "et",
            isPublished: false
        }).chain("upsert_relation", {
            subjectUri: context.feed!.uri, // Typed reference to the feed resource URI
            predicateUri: "https://schema.org/provider",
            objectUri: item.link
        }).foreach(item.categories).chain<string>((category) => {
            return AIQ.chain("upsert_relation", {
                subjectUri: item.link,
                predicateUri: "https://schema.org/about",
                objectUri: category // The category string from the array
            });
        });

    });