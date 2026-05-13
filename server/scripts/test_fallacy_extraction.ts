import { Curator } from '../src/services/Curator.js';

Curator.chain("fetch_html", { 
    url: "https://www.logicallyfallacious.com/fallacies" 
})
.onSuccess().chain((html: any) => 
    Curator.extract_resource_links({ 
        resourceUri: html.uri,
        selector: "h3 a",
        baseUrl: "https://www.logicallyfallacious.com"
    })

    .onSuccess().chain("debug", { 
        message: "Extracted {{data.linksFound}} links from fallacy index." 
    })
)
.run();
