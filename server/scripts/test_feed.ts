import { AIQ } from '../src/services/AIQ.js';


AIQ.chain("process_feed", { url: "http://uudised.err.ee/uudised_rss.php" })
    .onItem().chain((item) => {
        return AIQ.chain("upsert_resource", {
            uri: item.link,
            title: item.title,
            description: item.content,
            type: "ARTICLE",
            status: "DRAFT",
            language: "et",
            isPublished: false
        });
    });