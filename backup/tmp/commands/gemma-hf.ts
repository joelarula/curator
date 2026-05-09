import * as path from 'path';
import { HfInference } from '@huggingface/inference';
import { prisma } from '../db';

export async function gemmaHfCommand(file: string, moduleId: string, options: { prompt?: string }) {
    const filePath = path.resolve(file);

    console.error('\n⚠️  HF Inference API Option Not Available');
    console.error('FunctionGemma is not available on Hugging Face Inference API.');
    console.error('\n✅ Use one of these working options instead:\n');
    console.error('Option 1 - Google AI (cloud, fast):');
    console.error('  node dist/index.js gemma test/data/app-service.js ' + moduleId);
    console.error('\nOption 2 - Local FunctionGemma (downloads to your machine, no API key):');
    console.error('  node dist/index.js gemma-local test/data/app-service.js ' + moduleId);
    console.error('\nThe local option will download FunctionGemma (~500MB) and run it completely offline!');

    process.exit(1);
}
