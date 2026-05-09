import { AIQ } from '../src/services/AIQ.js';


AIQ.spawn("process_feed", { url: "http://uudised.err.ee/uudised_rss.php" })
    .onItem().chain((item) => {
        console.log(item);
        return AIQ.empty();
    });