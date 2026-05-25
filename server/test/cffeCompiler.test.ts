import { describe, it, expect } from 'vitest';
import { CffeCompiler } from '../src/services/ast/cffeCompiler.js';
import { ScriptRunner } from '../src/services/ScriptRunner.js';
import { PrismaClient } from '@prisma/client';

describe('CffeCompiler Hybrid Compiler', () => {

    it('should parse the YAML front matter correctly', () => {
        const source = `
meta:
  agent: "Test-Agent"
  purpose: "Validation"

pipeline:
  start_url: "https://example.com"
  base_url: "https://example.com"
  selectors:
    links: "a.link"

run: |
  index = Curator.chain "fetch_html", url: pipeline.start_url
`;

        const compiled = CffeCompiler.compile(source);

        expect(compiled.meta.agent).toBe("Test-Agent");
        expect(compiled.meta.purpose).toBe("Validation");
        expect(compiled.pipeline.start_url).toBe("https://example.com");
        expect(compiled.pipeline.selectors.links).toBe("a.link");
        expect(compiled.jsCode).toContain('Curator.chain("fetch_html"');
    });

    it('should pre-process markup blocks correctly', () => {
        const source = `
meta:
  agent: "Test"
pipeline: {}
run: |
  - [log-status]
    type: "success"
    msg: "Processing done"
`;

        const compiled = CffeCompiler.compile(source);

        // Verify pre-processed - [log-status] translates to Curator.debug
        expect(compiled.jsCode).toContain('Curator.debug');
        expect(compiled.jsCode).toContain('type: "success"');
        expect(compiled.jsCode).toContain('msg: "Processing done"');
    });

    it('should natively support Ruby-style string interpolation', () => {
        const source = `
meta:
  agent: "Test"
pipeline: {}
run: |
  title = "My Page"
  msg = "Ingested *#{title}* successfully"
`;

        const compiled = CffeCompiler.compile(source);

        // Verify standard CoffeeScript interpolation translates to ES6 templates
        expect(compiled.jsCode).toContain('Ingested *');
        expect(compiled.jsCode).toContain('${title}');
    });

    it('should compile the entire Fallacy Web Scraper Blueprint into formal AST', async () => {
        const blueprint = `
meta:
  agent: "Coffee-Curator-Agent"
  purpose: "Semantic Migration Agent"

pipeline:
  start_url: "https://www.logicallyfallacious.com/fallacies"
  base_url: "https://www.logicallyfallacious.com"
  selectors:
    index_links: "h3 a"
    fallacy_schema:
      title: "h1"
      description: "p.description"

run: |
  index = Curator.chain "fetch_html", url: pipeline.start_url

  index.onSuccess (html) =>
    links = Curator.extract_resource_links
      resourceUri: html.uri
      selector: pipeline.selectors.index_links
      baseUrl: pipeline.base_url

    links.onItemExtracted (link) =>
      scrape = Curator.scrape_resource
        url: link.url
        selectors: pipeline.selectors.fallacy_schema

      scrape.onSuccess (data) =>
        Curator.chain "upsert_relation",
          subjectUri: link.url
          objectUri: "http://schema.org/LogicalFallacy"
          justification: "Ingested *#{data.title}* via CoffeeScript Pipeline."

        - [log-status]
          type: "success"
          msg: "Successfully processed **#{data.title}**"
`;

        // 1. Mock DB context for ScriptRunner
        const prisma = {} as PrismaClient;

        // 2. Evaluate via ScriptRunner
        const ast: any = await ScriptRunner.evaluate(blueprint, {}, prisma, 'test-user-id');

        // 3. Verify AST Structure
        expect(ast.type).toBe('Sequence');
        expect(ast.steps).toHaveLength(3);

        const firstStep = ast.steps[0];
        expect(firstStep.type).toBe('ToolTask');
        expect(firstStep.tool).toBe('fetch_html');
        expect(firstStep.args.url).toBe("https://www.logicallyfallacious.com/fallacies");

        const secondStep = ast.steps[1];
        expect(secondStep.type).toBe('ToolTask');
        expect(secondStep.tool).toBe('extract_resource_links');
        expect(secondStep.args.selector).toBe("h3 a");

        // 4. Verify ForEach fan-out step
        const foreachStep = ast.steps[2];
        expect(foreachStep.type).toBe('ForEach');
        expect(foreachStep.iterator).toBe('item');
        expect(foreachStep.collection).toContain('toolOutputs');
    });
});
