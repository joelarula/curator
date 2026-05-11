import { AIQ } from '../src/services/AIQ.js';

AIQ.chain("fetch_html", { 
    url: "https://www.logicallyfallacious.com/fallacies" 
})
.onSuccess().chain((html: any) => 
    AIQ.extract_resource_links({ 
        resourceUri: html.uri,
        selector: "h3 a",
        baseUrl: "https://www.logicallyfallacious.com"
    })

    .onSuccess().chain("debug", { 
        message: "Extracted {{data.linksFound}} links from fallacy index." 
    })
)
.run();
