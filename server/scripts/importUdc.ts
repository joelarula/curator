import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

/**
 * importUdc.ts
 * 
 * Helper script to extract UDC categories from udcsummary-skos.rdf 
 * and generate a Prisma-seed compliant TypeScript module.
 */

const RDF_FILE = path.join(process.cwd(), 'assets', 'udcsummary-skos.rdf');
const OUTPUT_FILE = path.join(process.cwd(), 'prisma', 'seedData', 'udcCategories.ts');

function slugify(text: string) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')     // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-');   // Replace multiple - with single -
}

async function run() {
    console.log(`[UDC Import] Reading ${RDF_FILE}...`);
    const xml = fs.readFileSync(RDF_FILE, 'utf-8');
    
    console.log(`[UDC Import] Parsing XML with cheerio...`);
    const $ = cheerio.load(xml, { xmlMode: true });
    
    const concepts = $('skos\\:Concept');
    console.log(`[UDC Import] Found ${concepts.length} concepts.`);

    const results: any[] = [];
    const idToUriMap = new Map<string, string>();

    // Pass 1: Build URI map and extract basic data
    concepts.each((i, el) => {
        const concept = $(el);
        const about = concept.attr('rdf:about') || '';
        const notation = concept.find('skos\\:notation').text();
        const enLabel = concept.find('skos\\:prefLabel[xml\\:lang="en"]').text() || notation;
        const etLabel = concept.find('skos\\:prefLabel[xml\\:lang="et"]').text();
        
        const slug = slugify(enLabel);
        const uri = `udc:${notation.replace(/[^a-zA-Z0-9]/g, '_')}_${slug}`;
        
        idToUriMap.set(about, uri);

        results.push({
            about,
            uri,
            notation,
            title: enLabel,
            etLabel,
            broader: concept.find('skos\\:broader').attr('rdf:resource')
        });
    });

    console.log(`[UDC Import] Calculating nested set (treeStart/treeEnd)...`);
    
    // Build adjacency list
    const childrenMap = new Map<string, string[]>();
    const roots: string[] = [];
    
    results.forEach(item => {
        if (!item.broader) {
            roots.push(item.about);
        } else {
            const children = childrenMap.get(item.broader) || [];
            children.push(item.about);
            childrenMap.set(item.broader, children);
        }
    });

    let counter = 0;
    const treeMap = new Map<string, { start: number; end: number; depth: number }>();

    function dfs(id: string, depth: number = 0) {
        const start = ++counter;
        const children = childrenMap.get(id) || [];
        // Sort children by notation to keep them deterministic
        children.sort((a, b) => {
            const aNot = results.find(r => r.about === a)?.notation || '';
            const bNot = results.find(r => r.about === b)?.notation || '';
            return aNot.localeCompare(bNot);
        });
        children.forEach(childId => dfs(childId, depth + 1));
        const end = ++counter;
        treeMap.set(id, { start, end, depth });
    }

    // Sort roots too
    roots.sort((a, b) => {
        const aNot = results.find(r => r.about === a)?.notation || '';
        const bNot = results.find(r => r.about === b)?.notation || '';
        return aNot.localeCompare(bNot);
    });
    roots.forEach(rootId => dfs(rootId, 0));

    console.log(`[UDC Import] Processing final seed data...`);

    const seedData = results.map(item => {
        const parentUri = item.broader ? idToUriMap.get(item.broader) : null;
        const treeInfo = treeMap.get(item.about);
        
        return {
            uri: item.uri,
            title: item.title,
            enLabel: item.title,
            notation: item.notation,
            treeStart: treeInfo?.start ?? 0,
            treeEnd: treeInfo?.end ?? 0,
            depth: treeInfo?.depth ?? 0,
            category: 'UDC',
            parentUri: parentUri,
            etLabel: item.etLabel
        };
    });

    const content = `/**
 * Generated UDC Categories for Prisma Seed
 * Total items: ${seedData.length}
 */

export const udcCategories = ${JSON.stringify(seedData, null, 2)};
`;

    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, content);
    console.log(`[UDC Import] Successfully wrote ${seedData.length} items to ${OUTPUT_FILE}`);
}

run().catch(err => {
    console.error('[UDC Import] Failed:', err);
    process.exit(1);
});
