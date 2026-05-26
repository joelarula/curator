import { ScriptRunner } from '../src/services/ScriptRunner.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    const coffeeScriptSource = fs.readFileSync(path.resolve(__dirname, '../../scripts/summarize_weather.coffee'), 'utf-8');
    const coffeeAST = await ScriptRunner.evaluate(coffeeScriptSource, {}, {} as any, 'test-user-id');
    
    const tsModule = await import('../../scripts/summarize_weather.ts');
    const tsAST = tsModule.default.toAST();

    fs.writeFileSync(path.resolve(__dirname, 'coffee_ast.json'), JSON.stringify(coffeeAST, null, 2));
    fs.writeFileSync(path.resolve(__dirname, 'ts_ast.json'), JSON.stringify(tsAST, null, 2));
    console.log("ASTs written to scratch directory");
}
run().catch(console.error);
