import { AIQ } from '../src/services/AIQ.js';
AIQ.chain("query_resources", { 
    relation: { 
        predicateUri: "https://schema.org/about", 
        objectUri: "ilm" 
    } 
});
