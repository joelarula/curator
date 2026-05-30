import { Curator } from '../src/services/Curator.js';

Curator.init();

Curator.ask({
    prompt: 
    `explain ontology in simple terms`,
    model: "local-gemma-3-1b-it"
})
.toJSON();
