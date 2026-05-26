import CoffeeScript from 'coffeescript';
import YAML from 'yaml';

export class CffeCompiler {
    static compile(source: string): { meta: any; pipeline: any; jsCode: string } {
        // Parse the YAML front matter/content
        const parsed = YAML.parse(source);
        const meta = parsed.meta || {};
        const pipeline = parsed.pipeline || {};
        let runCode = parsed.run || '';

        // Pre-process markup blocks like `- [log-status]` in the CoffeeScript code
        // and replace with Curator.debug calls
        runCode = runCode.replace(/-\s*\[log-status\]/g, 'Curator.debug');

        // Wrap the CoffeeScript run block in a function to let CoffeeScript compiler
        // automatically insert implicit returns for the last expression, and explicitly
        // return the result of the function call at the top-level of the VM evaluation.
        const indentedCode = runCode.split('\n').map(line => '  ' + line).join('\n');
        const wrappedCode = `__cffe_run__ = ->\n${indentedCode}\nreturn __cffe_run__()`;

        // Compile the wrapped CoffeeScript run block to JavaScript
        let jsCode = '';
        try {
            jsCode = CoffeeScript.compile(wrappedCode, { bare: true });
        } catch (e: any) {
            throw new Error(`CoffeeScript compilation failed: ${e.message}`);
        }

        return {
            meta,
            pipeline,
            jsCode
        };
    }
}
