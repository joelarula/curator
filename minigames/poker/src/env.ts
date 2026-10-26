import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let envLoaded = false;

/**
 * Loads .env files from the current working directory and parent module directories.
 * Safely populates process.env with GOOGLE_API_KEY / GEMINI_API_KEY.
 */
export function loadEnvFiles(): void {
  if (envLoaded) return;
  envLoaded = true;

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      try {
        if (typeof (process as any).loadEnvFile === 'function') {
          (process as any).loadEnvFile(envPath);
        }
      } catch {
        // Silently continue if an individual .env file fails to parse
      }
    }
  }

}

/**
 * Returns the effective Gemini / Google API key if available.
 */
export function getGeminiApiKey(): string | undefined {
  loadEnvFiles();
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

// Redirect noisy library warnings (e.g. @google/genai redundant key notice)
const origConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Both GOOGLE_API_KEY and GEMINI_API_KEY are set')) {
    return;
  }
  origConsoleWarn(...args);
};

// Auto-load on initial import
loadEnvFiles();

