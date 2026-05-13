import { Curator } from '../src/services/Curator.js';

/**
 * ERR Jazz Intelligence Agent
 * 1. Polls ERR Culture RSS.
 * 2. Filters for Jazz-relevant keywords.
 * 3. Categorizes and tags in the Knowledge Graph.
 */
Curator.chain("process_feed", { 
    url: "http://uudised.err.ee/uudised_rss.php" 
})


.onItem().chain((item: any) => 
    Curator.upsert_resource({
        uri: item.link,
        title: item.title,
        description: item.contentSnippet,
        type: 'ARTICLE',
        status: 'NEW'
    })
    .onSuccess().chain((resource: any) => 
        Curator.ask_llm({
            systemPrompt: "Oled vana punkar.",
            prompt: `Nalja saab? 
            Vasta JSON formaadis: { "nalja saab": boolean, "reason": string, "entities": string[] }
            Uudis: ${resource.title}\n${resource.description}`,
            json: true
        })
        .onSuccess().chain((ai: any) => {
            if (ai["nalja saab"]) {
                // If it's Hiphop, upgrade its status and tag it
                return Curator.upsert_resource({
                    uri: resource.uri,
                    status: 'APPROVED',
                    type: 'HIPHOP_ARTICLE'
                })
                .onSuccess().chain("debug", { message: `🎤 Hiphop detected! ${resource.title}` });
            } else {
                // If not hiphop, skip it
                return Curator.debug({ message: `Skipping non-hiphop item: ${resource.title}` });
            }
        })

    )
)
.run();
