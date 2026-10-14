#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const appName = process.argv[2];

if (!appName) {
  console.error('Usage: npm run create:miniapp <miniapp-name>');
  console.error('Example: npm run create:miniapp fraud-detector');
  process.exit(1);
}

const targetDir = path.resolve(rootDir, 'miniapps', appName);

if (fs.existsSync(targetDir)) {
  console.error(`Error: Directory already exists: ${targetDir}`);
  process.exit(1);
}

console.log(`[Curator] Scaffolding new MiniApp: "${appName}" at ${targetDir}...`);

// Create directory structure
fs.mkdirSync(path.join(targetDir, 'src', 'server'), { recursive: true });
fs.mkdirSync(path.join(targetDir, 'scripts'), { recursive: true });
fs.mkdirSync(path.join(targetDir, 'test'), { recursive: true });

// 1. package.json
const packageJson = {
  name: `@miniapps/${appName}`,
  version: '1.0.0',
  type: 'module',
  scripts: {
    'dev:server': 'tsx src/server/index.ts',
    'build': 'tsc',
    'test': 'node --test test/app.test.ts',
    'start': 'node dist/src/server/index.js'
  },
  dependencies: {
    '@curator/agent-server': 'file:../../curator',
    '@curator/host': 'file:../../packages/host',
    'express': '^5.1.0',
    'graphql': '^16.14.2'
  },
  devDependencies: {
    '@types/express': '^5.0.0',
    '@types/node': '^22.19.1',
    'tsx': '^4.19.1',
    'typescript': '^5.6.2'
  }
};

fs.writeFileSync(
  path.join(targetDir, 'package.json'),
  JSON.stringify(packageJson, null, 2) + '\n',
  'utf-8'
);

// 2. tsconfig.json
const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    lib: ['ES2022'],
    outDir: './dist',
    rootDir: './',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true
  },
  include: ['src/**/*', 'test/**/*']
};

fs.writeFileSync(
  path.join(targetDir, 'tsconfig.json'),
  JSON.stringify(tsconfig, null, 2) + '\n',
  'utf-8'
);

// 3. src/plugin.ts
const pluginContent = `import { type CuratorPlugin, defineTool } from '@curator/agent-server';

export const sampleTool = defineTool({
  name: '${appName.replace(/-/g, '_')}_tool',
  description: 'Sample domain tool for ${appName}',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    },
    required: ['input']
  },
  accessLevel: 'safe_read',
  async execute(args) {
    return {
      status: 'success',
      processedAt: new Date().toISOString(),
      output: \`Processed: \${args.input}\`
    };
  }
});

export const ${appName.replace(/-/g, '')}Plugin: CuratorPlugin = {
  name: '${appName}',
  version: '1.0.0',
  description: 'Domain plugin for ${appName}',
  tools: {
    ['${appName.replace(/-/g, '_')}_tool']: sampleTool
  }
};
`;

fs.writeFileSync(path.join(targetDir, 'src', 'plugin.ts'), pluginContent, 'utf-8');

// 4. src/server/index.ts
const serverContent = `import express from 'express';
import { createCuratorHost } from '@curator/host';
import { ${appName.replace(/-/g, '')}Plugin } from '../plugin.js';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4100;

const host = createCuratorHost({
  port,
  plugins: [${appName.replace(/-/g, '')}Plugin]
});

await host.start();
console.log(\`[${appName}] Server running at http://localhost:\${port}\`);
`;

fs.writeFileSync(path.join(targetDir, 'src', 'server', 'index.ts'), serverContent, 'utf-8');

// 5. scripts/main.coffee
const coffeeContent = `# Sample Multi-Agent Workflow for ${appName}
forum('${appName}_room')
  .as_role('analyst')
  .say('Starting ${appName} evaluation run.')
  .tool('${appName.replace(/-/g, '_')}_tool', input: 'sample payload')
  .as_role('reviewer')
  .say('Analysis verified and validated.')
  .synthesize(as_role: 'reviewer', summary: 'Workflow completed successfully')
`;

fs.writeFileSync(path.join(targetDir, 'scripts', 'main.coffee'), coffeeContent, 'utf-8');

// 6. test/app.test.ts
const testContent = `import test from 'node:test';
import assert from 'node:assert/strict';
import { CuratorEngine, compileCoffeeScriptToAST } from '../../../curator/dist/src/index.js';
import { ${appName.replace(/-/g, '')}Plugin, sampleTool } from '../src/plugin.js';

test('${appName}: Plugin registers and tool executes', async () => {
  const engine = new CuratorEngine();
  engine.registerPlugin(${appName.replace(/-/g, '')}Plugin);

  assert.ok(engine.tools.has('${appName.replace(/-/g, '_')}_tool'));

  const result = await sampleTool.runAsync({
    args: { input: 'hello curator' },
    toolContext: {}
  }) as any;

  assert.equal(result.status, 'success');
  assert.equal(result.output, 'Processed: hello curator');
});

test('${appName}: CoffeeScript workflow compiles to valid AST', async () => {
  const script = \`
  forum('${appName}_room')
    .as_role('analyst')
    .say('Initiating task')
  \`;
  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
});
`;

fs.writeFileSync(path.join(targetDir, 'test', 'app.test.ts'), testContent, 'utf-8');

// 7. README.md
const readmeContent = `# ${appName} (Curator MiniApp)

Scaffolded with Curator MiniApp engine.

## Getting Started

\`\`\`bash
npm run test          # Run test suite
npm run dev:server    # Start local Express + Curator Host
\`\`\`
`;

fs.writeFileSync(path.join(targetDir, 'README.md'), readmeContent, 'utf-8');

console.log(`[Curator] Successfully scaffolded miniapps/${appName}!`);
console.log(`To get started:`);
console.log(`  cd miniapps/${appName}`);
console.log(`  npm run test`);
console.log(`  npm run dev:server`);
