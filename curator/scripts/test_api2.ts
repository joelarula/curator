import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

async function main() {
  const contents = `Here are the news items:

- uri: https://www.err.ee/1610055052/aktuaalne-kaamera-kell-19-00
  title: Aktuaalne kaamera kell 19:00
  description: null
- uri: https://sport.err.ee/1610055019/jaatmate-duell-laskmised-mk-etapil-ei-onnestunud
  title: Jäätmate duell-laskmised MK-etapil ei õnnestunud
  description: Eesti plokkvibulaskjatel ei läinud maailmakarikaetapil Antalyas duell-laskmistes kuigi hästi ja kõrged kohad jäid Türgis võtmata.

Please write a short summary of these news items in English.`;

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { role: 'user', parts: [{ text: contents }] }
    ]
  });

  console.log('Result:', result.text);
}

main().catch(console.error);
