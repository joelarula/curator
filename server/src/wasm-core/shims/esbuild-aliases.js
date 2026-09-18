import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getWasmCoreEsbuildAliases() {
    const nodeShims = path.resolve(__dirname, 'browser-node-shims.ts');

    return {
        'node:vm': nodeShims,
        'vm': nodeShims,
        'fs': nodeShims,
        'node:fs': nodeShims,
        'fs/promises': nodeShims,
        'node:fs/promises': nodeShims,
        'url': nodeShims,
        'node:url': nodeShims,
        'os': nodeShims,
        'node:os': nodeShims,
        'crypto': nodeShims,
        'node:crypto': nodeShims,
        'http': nodeShims,
        'node:http': nodeShims,
        'https': nodeShims,
        'node:https': nodeShims,
        'timers': nodeShims,
        'node:timers': nodeShims,
        'dotenv': nodeShims,
        'path': 'path-browserify',
        'node:path': 'path-browserify',
        '#wasm-compiler-loader': path.resolve(__dirname, 'prisma-wasm-loader.ts')
    };
}
