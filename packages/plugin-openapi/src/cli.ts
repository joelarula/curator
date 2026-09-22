#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { generateStaticOpenApiTools } from './generator.js';

async function main() {
  const args = process.argv.slice(2);
  let inputPath = '';
  let outputPath = '';
  let namespace = '';
  let baseUrl = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '-i') {
      inputPath = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[++i];
    } else if (args[i] === '--namespace' || args[i] === '-n') {
      namespace = args[++i];
    } else if (args[i] === '--baseUrl' || args[i] === '-b') {
      baseUrl = args[++i];
    }
  }

  if (!inputPath) {
    console.error('Usage: curator-openapi --input <spec.json|yaml|url> [--output <file.ts>] [--namespace <name>] [--baseUrl <url>]');
    process.exit(1);
  }

  let specContent: string;
  if (inputPath.startsWith('http://') || inputPath.startsWith('https://')) {
    console.log(`[OpenAPI] Fetching spec from ${inputPath}...`);
    const res = await fetch(inputPath);
    if (!res.ok) throw new Error(`Failed to fetch spec: HTTP ${res.status}`);
    specContent = await res.text();
  } else {
    console.log(`[OpenAPI] Reading spec from ${inputPath}...`);
    specContent = fs.readFileSync(path.resolve(process.cwd(), inputPath), 'utf-8');
  }

  const { code, operationsCount } = generateStaticOpenApiTools({
    spec: specContent,
    namespace: namespace || undefined,
    defaultBaseUrl: baseUrl || undefined,
  });

  if (outputPath) {
    const resolvedOut = path.resolve(process.cwd(), outputPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, code, 'utf-8');
    console.log(`[OpenAPI] Successfully generated ${operationsCount} static tools into ${resolvedOut}`);
  } else {
    process.stdout.write(code);
  }
}

main().catch((err) => {
  console.error('[OpenAPI] Error:', err);
  process.exit(1);
});
