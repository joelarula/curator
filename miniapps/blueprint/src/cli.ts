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
      const tool = host.engine.tools.get('calculate_metric');
      const output = await tool.runAsync({
        args: { baseValue: Number(baseValue), multiplier: Number(multiplier) },
        toolContext: { prisma: host.prisma },
      });
      console.log(JSON.stringify(output, null, 2));
    } finally {
      await host.stop();
    }
  });

program.parse(process.argv);
