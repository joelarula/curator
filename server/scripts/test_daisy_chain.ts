import { AIQ } from '../src/services/AIQ.js';

AIQ.spawn('debug', { message: "I am the root background request. I am spawning child 1." })
    .onSuccess()
    .spawn('debug', { message: "I am child 1. I am spawning child 2." })
    .onSuccess()
    .spawn('ask_llm', { prompt: "What is the current time? Be brief.", model: "gemini-3.1-flash-lite" });
