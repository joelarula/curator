import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ai = new GoogleGenAI({});
ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Summarize the following articles provided in this JSON block:\n\n```json\n[\n  {\n    "uri": "https://sport.err.ee/1610055067/valencia-lopetas-drelli-klubi-hooaja",\n    "title": "Valencia lõpetas Drelli klubi hooaja",\n    "description": "Henri Drelli klubi Badalona Joventut kaotas Hispaania meistrivõistluste poolfinaali kolmanda kohtumise kodus Valenciale 75:87 (18:20, 21:21, 16:23, 20:23) ja kogu seeria null-kolm."\n  }\n]\n```\n\nYour task is to write a single 2-3 sentence paragraph summarizing the most important news.',
  config: {
    systemInstruction: 'You are a news summarizer.'
  }
}).then(res => console.log('RESPONSE:', res.text)).catch(console.error);
