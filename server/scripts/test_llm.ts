import { Curator } from '../src/services/Curator.js';

Curator.ask({
    prompt: "Hello! This is a simple API availability test. Please respond with a brief confirmation that you are online and operational.",
    model: "gemini-3.1-flash-lite"
})
.toJSON();
