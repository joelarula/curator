import { Curator } from '../src/services/Curator.js';
Curator.chain("query_resources", { 
    relation: { 
        predicateUri: "https://schema.org/about", 
        objectUri: "ilm" 
    } 
});
