#!/usr/bin/env node

import { createHostCli } from '@curator/host';
import { createBlueprintHost } from './host.js';

const program = createHostCli(createBlueprintHost, {
  name: 'curator-blueprint-cli',
  description: 'Command-line execution & management interface for Curator Blueprint MiniApp',
  version: '1.0.0',
});

// MiniApp domain-specific custom commands can be added here:
program
  .command('calculate <baseValue> <multiplier>')
  .description('Direct domain helper to compute metrics using blueprint calculator')
  .action(async (baseValue: string, multiplier: string) => {
    const host = await createBlueprintHost();
    try {
      const { result } = await host.runTool(
        'calculate_metric',
        { baseValue: Number(baseValue), multiplier: Number(multiplier) },
        { origin: 'CLI' }
      );
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await host.stop();
    }
  });

// Interactive Asynchronous SQLite REPL client
program
  .command('repl', { isDefault: false })
  .alias('shell')
  .description('Start interactive asynchronous client REPL for Blueprint MiniApp (SQLite in-process or server channel)')
  .option('--direct', 'Run direct in-process SQLite execution mode', true)
  .option('--server <url>', 'Connect to remote Blueprint server URL', 'http://127.0.0.1:4100')
  .option('--name <user>', 'User name for REPL', 'User')
  .action(async (opts) => {
    const { runBlueprintClient } = await import('./client/blueprintClient.js');
    await runBlueprintClient({
      direct: opts.direct !== false,
      serverUrl: opts.server,
      userName: opts.name,
    });
  });

program.parse(process.argv);
