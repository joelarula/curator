import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { FileData } from '@prisma/client';
import { save, remove, consult } from './service';
import { createSha256Hash } from './utils/hash';

const program = new Command();
const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });


program
  .name('curator-cli')
  .description('A CLI tool for managing curator tasks.')
  .version('1.0.0');


program
  .command('add')
  .description('Add a new file to the project.')
  .argument('<text>', 'The text')
  //.requiredOption('-t, --text <text>', 'The text to add.')
  .action(async (text: string) => {

    const hash = createSha256Hash(text);
    console.log(`✅ Adding item: "${text}" with hash ${hash}`);

    const file: FileData = {
      id: 0, // Will be set by database
      name: text,
      hash: hash,
      size: text.length,
      mimeType: 'text/plain',
      content: Buffer.from(text),
      source: null,
      projectId: 1, // Default project ID
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const savedFile = await save(file);
  });


program
  .command('remove')
  .description('Remove file by its name.')
  .argument('<name>', 'The unique name of the item to remove.')
  .action((name: string) => {
    remove(name, 1);
  });


program
  .command('query')
  .description('Query files.')
  .argument('<query>', 'The query string to search for.')
  .action((query: string) => {
    consult(query).then(results => {
      console.log('✅ Query Results:', results);
    });
  });

//program
//  .command('query')
//  .description('Query items.')
//  .requiredOption('-q, --query <query>', 'The query string to search for.')
//  .action((options: { query: string }) => {
//    console.log(` Querying items with query: "${options.query}"`);
//    
//    queryData(options.query).then(results => {
//      console.log('✅ Query Results:', results);
//    });
//});


program.parse(process.argv);