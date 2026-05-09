import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import { initializeLangchainVectorStore } from '../langchain/langchain.service';
import { ERR_GOOGLE_API_KEY_MISSING, ERR_GENERATION_FAILED } from '../../errors';

export async function consult(query: string, projectId?: number, k: number = 5) {
    const vectorStore = await initializeLangchainVectorStore();
    console.log(`✅ Consult > "${query}" (Project: ${projectId || 'Global'}).`);

    // PrismaVectorStore expects filters in the format { column: { operator: value } }
    const filter = projectId ? { projectId: { equals: projectId } } : undefined;
    const results = await vectorStore.similaritySearchWithScore(query, k, filter);

    return results.map(([doc, score]: [any, any]) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        score,
    }));
}

export async function ragAgent(query: string, projectId?: number, k: number = 5) {
    console.log(`✅ RAG Agent > "${query}" (Project: ${projectId || 'Global'}).`);

    // Get relevant context from vector store
    const vectorStore = await initializeLangchainVectorStore();

    // PrismaVectorStore expects filters in the format { column: { operator: value } }
    const filter = projectId ? { projectId: { equals: projectId } } : undefined;

    let results: any[] = [];
    try {
        results = await vectorStore.similaritySearchWithScore(query, k, filter);
    } catch (error: any) {
        console.error('Vector store search failed:', error.message);
        // Fallback or re-throw if it's not the join([]) error
        if (!error.message.includes('join([])')) throw error;
    }

    // Build context from top results
    const context = results.length > 0
        ? results.map(([doc, score]: [any, any], index: number) =>
            `[${index + 1}] (relevance: ${score.toFixed(4)})\n${doc.pageContent}`
        ).join('\n\n---\n\n')
        : "No relevant information found in the knowledge base.";

    // Initialize Google Generative AI
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error(ERR_GOOGLE_API_KEY_MISSING);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite-preview', // Updated to 3.1 lite (preview) per discovery
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
        }
    });

    // Create RAG prompt
    const contextType = projectId ? `within the context of project ID ${projectId}` : `across all available projects`;
    const prompt = `You are a helpful AI assistant. Answer the user's question based on the provided context.
If the context is empty or doesn't contain the answer, use your general knowledge but clearly state that you couldn't find specific documentation for this ${projectId ? 'project' : 'topic'} in the repository.

Context ${contextType}:
${results.length > 0 ? context : "(No matching documents found)"}

User question: ${query}

Response Format:
1. Direct answer.
2. Link to source if available.
3. Suggestion for further exploration if appropriate.`;

    // Generate response with retry logic
    let result;
    let retries = 3;
    let delay = 1000;

    for (let i = 0; i < retries; i++) {
        try {
            result = await model.generateContent(prompt);
            break;
        } catch (error: any) {
            if (error.status === 429 && i < retries - 1) {
                console.log(`Rate limited, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            } else {
                throw error;
            }
        }
    }

    if (!result) {
        throw new Error(ERR_GENERATION_FAILED);
    }

    const response = result.response;
    const answer = response.text();

    return {
        answer,
        sources: results.map(([doc, score]: [any, any]) => ({
            content: doc.pageContent,
            metadata: doc.metadata,
            score,
        }))
    };
}
