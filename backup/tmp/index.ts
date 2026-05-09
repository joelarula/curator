import 'dotenv/config';
import { Command } from 'commander';
import { cleanCommand } from './commands/clean';
import { astCommand } from './commands/ast';
import { structureCommand } from './commands/structure';
import { webpackCommand } from './commands/webpack';
import { meanifyCommand } from './commands/meanify';
import { meanifyAllCommand } from './commands/meanify-all';
import { referencesCommand } from './commands/references';
import { gemmaCommand } from './commands/gemma';
import { gemmaHfCommand } from './commands/gemma-hf';
import { gemmaLocalCommand, agentCommand } from './commands/gemma-local';

const program = new Command();

program
    .name('meanifier')
    .description('CLI to transform TypeScript files into AST JSON')
    .version('1.0.0');

program.command('clean')
    .description('Reset the database')
    .action(cleanCommand);

program.command('ast')
    .description('Parse a file and save AST to database')
    .argument('<file>', 'file to parse')
    .action(astCommand);

program.command('structure')
    .description('Print AST structure')
    .argument('<file>', 'file to inspect')
    .option('-d, --depth <number>', 'max depth to print')
    .option('-m, --module <moduleId>', 'show structure for specific module only')
    .action(structureCommand);

program.command('webpack')
    .description('Extract Webpack bundle info')
    .argument('<file>', 'file to inspect')
    .action(webpackCommand);

program.command('meanify')
    .description('Explain a module and suggest a name')
    .argument('<file>', 'file to inspect')
    .argument('<moduleId>', 'module ID to explain')
    .action(meanifyCommand);

program.command('meanify-all')
    .description('Explain all unmeanified modules')
    .argument('<file>', 'file to inspect')
    .option('-d, --delay <ms>', 'delay between requests in milliseconds (default: 1000)')
    .action(meanifyAllCommand);

program.command('references')
    .description('Find modules that reference a specific module ID')
    .argument('<file>', 'file to inspect')
    .argument('<moduleId>', 'module ID to find references for')
    .action(referencesCommand);

program.command('gemma')
    .description('Analyze a module using Gemini with function calling')
    .argument('<file>', 'file to inspect')
    .argument('<moduleId>', 'module ID to analyze')
    .option('-p, --prompt <text>', 'custom prompt for analysis')
    .action(gemmaCommand);

program.command('gemma-hf')
    .description('Analyze a module using Gemma via Hugging Face')
    .argument('<file>', 'file to inspect')
    .argument('<moduleId>', 'module ID to analyze')
    .option('-p, --prompt <text>', 'custom prompt for analysis')
    .action(gemmaHfCommand);

program.command('gemma-local')
    .description('Analyze a module using FunctionGemma locally (no API key needed)')
    .argument('<file>', 'file to inspect')
    .argument('<moduleId>', 'module ID to analyze')
    .option('-p, --prompt <text>', 'custom prompt for analysis')
    .action(gemmaLocalCommand);

program.command('agent <prompt>')
    .description('Run Meanifier as an agent (using local FunctionGemma)')
    .action(agentCommand);

program.parse();
