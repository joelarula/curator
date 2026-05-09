import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

async function listModels() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('GOOGLE_API_KEY missing');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        // Note: The JS SDK doesn't have a direct listModels, but we can try to find out 
        // by checking error messages or using a fetch to the endpoint if needed.
        // However, some versions have it under genAI.listModels()? 
        // Let's check the library first.
        console.log('Checking available models via discovery...');

        // Most reliable way in node with current SDK is to try a few known ones 
        // but the error message suggested calling ListModels.
        // We can use the REST API via fetch to be absolute.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.models) {
            console.log('Available Models:');
            data.models.forEach((m: any) => {
                console.log(`- ${m.name} (Methods: ${m.supportedGenerationMethods.join(', ')})`);
            });
        } else {
            console.log('No models found or error:', data);
        }
    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
