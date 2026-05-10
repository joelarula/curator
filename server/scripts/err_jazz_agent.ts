import { AIQ } from '../src/services/AIQ.js';

/**
 * ERR Jazz Intelligence Agent
 * 1. Polls ERR Culture RSS.
 * 2. Filters for Jazz-relevant keywords.
 * 3. Categorizes and tags in the Knowledge Graph.
 */
AIQ.chain("process_feed", { 
    url: "https://www.err.ee/rss/kultuur" 
})
.onItem().chain((item: any) => 
    AIQ.upsert_resource({
        uri: item.link,
        title: item.title,
        description: item.contentSnippet,
        type: 'ARTICLE',
        status: 'NEW'
    })
    .onSuccess().spawn((resource: any) => 
        AIQ.ask_llm({
            systemPrompt: "Oled Eesti kultuuriajakirjanik ja džässiekspert.",
            prompt: `Kas see uudis on seotud džässmuusika, džässifestivalide või džässmuusikutega? 
            Vasta JSON formaadis: { "isJazz": boolean, "reason": string, "entities": string[] }
            Uudis: ${resource.title}\n${resource.description}`,
            json: true
        })
        .onSuccess().chain((ai: any) => {
            if (ai.isJazz) {
                // If it's Jazz, upgrade its status and tag it
                return AIQ.upsert_resource({
                    uri: resource.uri,
                    status: 'APPROVED',
                    type: 'JAZZ_ARTICLE'
                })
                .onSuccess().chain("debug", { message: `🎷 Jazz detected! ${resource.title}` });
            } else {
                // If not jazz, soft-delete it from the active graph
                return AIQ.debug({ message: `Skipping non-jazz item: ${resource.title}` });
            }
        })
    )
)
.run();
