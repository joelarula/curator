import test from 'node:test';
import assert from 'node:assert/strict';
import { createCuratorHost } from '../../host/dist/index.js';
import {
  createCuratorRouter,
  createCuratorServer,
  executeCuratorGraphql,
  curatorGraphQLTypeDefs,
} from '../dist/index.js';

test('createCuratorRouter and executeCuratorGraphql', async () => {
  const host = await createCuratorHost({
    name: 'test_server_host',
    dataDir: './data/test_server',
  });

  try {
    // 1. Verify router instantiation
    const router = createCuratorRouter(host);
    assert.ok(router, 'Router should be created');

    // 2. Verify GraphQL execution
    const query = /* GraphQL */ `
      query GetMetrics {
        metrics {
          totalRequests
          databaseEngine
        }
        tools {
          name
        }
      }
    `;

    const res = await executeCuratorGraphql(host, query);
    assert.ok(res.data, 'GraphQL data should be returned');
    assert.equal(res.data.metrics.databaseEngine, 'SQLite');
    assert.ok(Array.isArray(res.data.tools));

    // 3. Verify CoffeeScript compilation via GraphQL mutation
    const coffeeMutation = /* GraphQL */ `
      mutation CompileSampleCoffee {
        compileCoffeeScript(code: "seq [tool 'echo', set_state done: true]") {
          success
          ast
          error
        }
      }
    `;

    const compileRes = await executeCuratorGraphql(host, coffeeMutation);
    assert.ok(compileRes.data);
    assert.equal(compileRes.data.compileCoffeeScript.success, true);
    assert.ok(compileRes.data.compileCoffeeScript.ast);

  } finally {
    await host.stop();
  }
});

test('createCuratorServer lifecycle and HTTP execution', async () => {
  const host = await createCuratorHost({
    name: 'test_http_host',
    dataDir: './data/test_server_http',
  });

  const serverInstance = await createCuratorServer(host, {
    port: 0, // OS assigned ephemeral port
    autoStartProcessor: false,
  });

  try {
    const { port, url } = await serverInstance.start(0);
    assert.ok(port > 0);
    assert.ok(url.startsWith('http://localhost:'));

    // Test GET /api/status
    const statusRes = await fetch(`${url}/api/status`);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.status, 'online');
    assert.equal(statusJson.name, 'test_http_host');

    // Test POST /api/curator/ast/compile-coffee
    const coffeeRes = await fetch(`${url}/api/curator/ast/compile-coffee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: "seq [tool 'echo', set_state active: false]" }),
    });
    const coffeeJson = await coffeeRes.json();
    assert.equal(coffeeJson.success, true);
    assert.ok(coffeeJson.ast);

    // Test POST /graphql
    const gqlRes = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ metrics { databaseEngine } }' }),
    });
    const gqlJson = await gqlRes.json();
    assert.equal(gqlJson.data.metrics.databaseEngine, 'SQLite');

  } finally {
    await serverInstance.stop();
  }
});
