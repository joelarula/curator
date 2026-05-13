import { Pipeline } from '../src/services/ast/builder.js';
import { TOOLS } from '../src/services/tools/manifest.js';

const pipeline = new Pipeline();

pipeline.tool(TOOLS.BROWSER_ACTION, {
    commands: [
        { type: 'navigate', url: 'https://duckduckgo.com/?q=test' },
        { type: 'wait', timeout: 5000 },
        { type: 'screenshot' }
    ]
});

export default pipeline;
