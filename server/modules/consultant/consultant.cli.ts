import { Command } from 'commander';
import { consult } from './consultant.service';

export function registerConsultantCommands(program: Command) {
    program
        .command('query')
        .description('Query files.')
        .argument('<query>', 'The query string to search for.')
        .action((query: string) => {
            consult(query).then(results => {
                console.log('✅ Query Results:', results);
            });
        });
}
