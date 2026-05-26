import { describe, it, expect } from 'vitest';
import { ScriptRunner } from '../src/services/ScriptRunner.js';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

describe('AST Functional Parity', () => {
    it('should generate functionally compatible AST for CoffeeScript and TypeScript pipelines', async () => {
        const coffeeScriptSource = fs.readFileSync(path.resolve(__dirname, '../scripts/summarize_weather.coffee'), 'utf-8');
        const prisma = {} as PrismaClient;
        const coffeeAST = await ScriptRunner.evaluate(coffeeScriptSource, {}, prisma, 'test-user-id');
        
        const tsModule = await import('../scripts/summarize_weather.js'); 
        const pipeline = tsModule.default;
        const tsAST = pipeline.toAST();

        const normalizeAst = (ast: any) => {
            let str = JSON.stringify(ast);
            // Normalize IDs
            str = str.replace(/tool_[a-zA-Z0-9_]+_[\w\d]+_\d+/g, (match) => {
                 const parts = match.split('_');
                 return parts.slice(0, parts.length - 2).join('_'); 
            });
            str = str.replace(/seq_[\w\d]+_\d+/g, 'seq_norm');
            
            // Normalize toolOutputs vs toolData references so they match structurally
            str = str.replace(/\{\{toolData\.([a-zA-Z0-9_]+)\}\}/g, '{{toolOutputs.tool_$1.data}}');
            str = str.replace(/\{\{toolData\./g, '{{toolOutputs.tool_');
            
            return JSON.parse(str);
        };

        const normalizedCoffee = normalizeAst(coffeeAST);
        const normalizedTS = normalizeAst(tsAST);

        // Normalize whitespace in string arguments for comparison (since TS uses padded template literals)
        const normalizeWhitespace = (obj: any) => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = obj[key].replace(/\s+/g, ' ').trim();
                } else if (typeof obj[key] === 'object') {
                    normalizeWhitespace(obj[key]);
                }
            }
        };

        normalizeWhitespace(normalizedCoffee);
        normalizeWhitespace(normalizedTS);

        expect(normalizedCoffee).toEqual(normalizedTS);
    });
});
