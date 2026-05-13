import { Curator } from '../src/services/Curator.js';

/**
 * UDC Hierarchy Builder Agent (Version 2)
 * 
 * Logic:
 * 1. Find all UDC CONCEPT resources.
 * 2. Use the 'extract_udc_hierarchy' tool to calculate the parent.
 * 3. The tool returns [data] if a parent exists, or [] if top-level.
 * 4. Chain correctly maps the hierarchy.
 */
const udcHierarchyAgent = Curator
    // 1. Find resources that look like UDC Concepts
    .chain("query_resources", { 
        type: "CONCEPT"
    })
    // 2. Pass the resource URI to the utility tool
    .onItem().chain("extract_udc_hierarchy", { 
        uri: "{{item.uri}}" 
    })
    // 3. The tool's fannable output (items: [data]) handles the logic
    .onItem().chain((udc: any) => {
        return Curator.chain("upsert_resource", {
            uri: udc.parentUri,
            title: `UDC ${udc.parentNotation} (Parent)`,
            type: "CONCEPT",
            status: "ACTIVE"
        }).chain("upsert_relation", {
            subjectUri: udc.childUri,
            predicateUri: "http://www.w3.org/2004/02/skos/core#broader",
            objectUri: udc.parentUri
        }).chain("debug", { 
            message: `Hierarchically linked ${udc.childNotation} to broader category ${udc.parentNotation}` 
        });
    });

export default udcHierarchyAgent;
