import { Command } from 'commander';
import { FileData } from '@prisma/client';
import { save, remove } from './fileoperations';
import { createSha256Hash } from './hash';

export function registerProjectCommands(program: Command) {
    program
        .command('add')
        .description('Add a new file to the project.')
        .argument('<text>', 'The text')
        .action(async (text: string) => {
            const hash = createSha256Hash(text);
            console.log(`✅ Adding item: "${text}" with hash ${hash}`);

            const file: any = {
                name: text,
                hash: hash,
                size: text.length,
                mimeType: 'text/plain',
                content: Buffer.from(text).toString('base64'),
                source: 'cli_add',
                projectId: 1,
            };

            await save(file);
        });

    program
        .command('remove')
        .description('Remove file by its name.')
        .argument('<name>', 'The unique name of the item to remove.')
        .action((name: string) => {
            remove(name, 1);
        });
}
