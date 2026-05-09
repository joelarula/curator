import { AIQ } from '../src/services/AIQ.js';

AIQ.spawn("process_feed", { url: "http://uudised.err.ee/uudised_rss.php" })
    .onItem().spawn((item, context) => {
        return AIQ.chain("upsert_resource", {
            uri: item.link,
            title: item.title,
            description: item.content,
            type: "ARTICLE",
            status: "DRAFT",
            language: "et",
            isPublished: false
        }).chain("upsert_relation", {
            subjectUri: context.feed.uri, // Reference the feed resource URI
            predicateUri: "https://schema.org/provider",
            objectUri: item.link
        });
    });