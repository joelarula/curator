import { Command } from 'commander';
import 'dotenv/config';
import { registerProjectCommands } from './modules/project/project.cli';
import { registerConsultantCommands } from './modules/consultant/consultant.cli';

const program = new Command();

program
  .name('curator-cli')
  .description('A CLI tool for managing curator tasks.')
  .version('1.0.0');

// Register modular commands
registerProjectCommands(program);
registerConsultantCommands(program);

program.parse(process.argv);