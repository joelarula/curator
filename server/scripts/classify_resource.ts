import { AIQ } from '../src/services/AIQ.js';

/**
 * Decomposed Resource Classification Script
 * 
 * Usage: npx tsx src/bin/aiq.ts scripts/classify_resource.ts <RESOURCE_URI>
 * 
 * This script demonstrates a professional, transparent classification pipeline:
 * 1. Fetch resource by URI.
 * 2. Ask LLM for structured UDC categories using a custom prompt.
 * 3. Fan out results to create semantic relations.
 */
AIQ.init();

const uri = "https://sport.err.ee/1610021590/tsehhi-korvpallitaht-astub-kaimasoleva-hooaja-jarel-korvale"
console.log(`[Script] AIQ.argString: "${uri}"`);


if (!uri) {

    console.log("USAGE: npx tsx src/bin/aiq.ts scripts/classify_resource.ts <RESOURCE_URI>");
    process.exit(0);
}

const UDC_PROMPT = `
Classify the following Estonian text into one or more UDC (Universal Decimal Classification) categories.
Return ONLY a valid JSON list of objects, each containing:
- "code": The UDC notation (e.g. "133.52")
- "title_en": A brief description of the category in English.
- "title_et": A brief description of the category in Estonian.
- "justification": A brief explanation (in Estonian) why this category applies to the text.


TEXT TO CLASSIFY:
Title: {{article.title}}
Description: {{article.description}}
Source Categories: {{category_names.data}}
`;



AIQ.init();
console.log(`[Script] DEBUG AIQ.args:`, AIQ.args);
console.log(`[Script] DEBUG AIQ.args type:`, typeof AIQ.args);
console.log(`[Script] DEBUG AIQ.argString:`, AIQ.argString);



/**
 * Find resources to classify. 
 * If a URL is passed via CLI, use it. Otherwise query all DRAFT articles.
 */
const targetUri = AIQ.args[0];

const sourceFlow = targetUri
    ? AIQ.get_resource({ uri: targetUri })
    : AIQ.query_resources({
        status: 'DRAFT',
        type: 'ARTICLE',
        excludeRelation: {
            predicateUri: AIQ.VOCAB.DC.subject,
            objectUriContains: 'udc:'
        },
        limit: 1
    });

const flow = sourceFlow
    .onItem().as('article').get_resource({ id: AIQ.item.id }) // Refresh with full relations
    .onItem()

    .select_objects({ items: AIQ.item.subjectRelations, predicateUri: 'err:about' })
    .as('cats')
    .format_list({
        items: AIQ.ref('cats'),
        template: '{{title}}',
        separator: ', '
    })
    .as('category_names')
    .spawn()
    .ask({
        prompt: UDC_PROMPT,
        output: "LIST"
    })

    .onItem().upsert_resource({
        uri: "udc:{{item.code}}",
        title: "{{item.title_et}}",
        type: AIQ.VOCAB.TYPE.udcCategory
    })
    .upsert_relation({
        subjectUri: "{{article.uri}}",
        predicateUri: AIQ.VOCAB.DC.subject,
        objectUri: "udc:{{item.code}}",
        justification: "{{item.justification}}"
    });



export default flow;
