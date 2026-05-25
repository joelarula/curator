import YAML from 'yaml';
import coffee from 'coffeescript';

export interface CompiledCffe {
    jsCode: string;
    pipeline: any;
    meta: any;
}

export class CffeCompiler {
    /**
     * Compiles a .cffe hybrid source text into JavaScript code and static configuration metadata.
     */
    static compile(content: string): CompiledCffe {
        const trimmed = content.trim();
        const isHybrid = trimmed.startsWith('meta:') || 
                         trimmed.startsWith('pipeline:') || 
                         trimmed.includes('\nrun:') || 
                         trimmed.startsWith('run:');

        let meta: any = {};
        let pipeline: any = {};
        let runCode = '';

        if (isHybrid) {
            // 1. Parse the YAML outer shell structure
            let parsed: any;
            try {
                parsed = YAML.parse(content);
            } catch (e: any) {
                throw new Error(`CffeScript YAML Parse Error: ${e.message}`);
            }

            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Invalid CffeScript: Failed to parse YAML structure.');
            }

            meta = parsed.meta || {};
            pipeline = parsed.pipeline || {};
            runCode = parsed.run || '';
        } else {
            // 2. Fallback: treat the entire file as pure CoffeeScript
            runCode = content;
        }

        if (!runCode) {
            throw new Error('Invalid CffeScript: Missing "run" logic block.');
        }

        // 2. Pre-process the CoffeeScript run block to map hybrid layout blocks
        const processedLines = runCode.split('\n').map((line: string) => {
            // Match custom hybrid layout block markup: - [log-status]
            const match = line.match(/^(\s*)-\s*\[([a-zA-Z0-9_-]+)\]\s*$/);
            if (match) {
                const indent = match[1];
                const componentName = match[2];
                
                // Map layout component to corresponding tool call
                let toolName = componentName;
                if (componentName === 'log-status' || componentName === 'log') {
                    toolName = 'debug';
                } else {
                    toolName = componentName.replace(/-/g, '_');
                }
                
                return `${indent}Curator.${toolName}`;
            }
            return line;
        });

        const preprocessedRun = processedLines.join('\n');

        // 3. Compile the standard CoffeeScript syntax into clean JavaScript
        let jsCode = '';
        try {
            jsCode = coffee.compile(preprocessedRun, { bare: true });
            
            // Append explicit return of Curator.run() to ensure VM evaluation returns the root chain
            if (!jsCode.includes('\nreturn ') && !jsCode.startsWith('return ')) {
                jsCode += '\nreturn Curator.run();';
            }
        } catch (e: any) {
            throw new Error(`CoffeeScript Transpilation Error: ${e.message}`);
        }

        return {
            jsCode,
            pipeline,
            meta
        };
    }
}
