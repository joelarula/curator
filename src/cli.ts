import { Command } from 'commander';
import { FileDataType, PrismaClient,FileData } from '@prisma/client';
import { saveFile,queryData } from './service';
import { createSha256Hash } from './utils/hash';

const program = new Command();
const prisma = new PrismaClient();


program
  .name('curator-cli')
  .description('A CLI tool for managing curator tasks.')
  .version('1.0.0');


program
  .command('add')
  .description('Add a new item to the project.')
  .requiredOption('-t, --text <text>', 'The text to add.')
  .action(async (options: { text: string }) => {
    
    const hash = createSha256Hash(options.text);
    console.log(`✅ Adding item: "${options.text}" with hash ${hash}`);

    const file: FileData = {
      id: 0, // Will be set by database
      name: options.text,
      type: FileDataType.TEXT,
      hash: hash,
      size: options.text.length,
      mimeType: 'text/plain',
      content: Buffer.from(options.text),
      source: null,
      version: 1,
      projectId: 1, // Default project ID
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const savedFile = await saveFile(file);
    console.log('✅ File saved successfully with ID:', savedFile.id);

    // Add logic for data validation
  });


// ----------------------------------------------------
// 3. 'REMOVE' Command: remove <id>
//    - Requires a positional argument: <id>
// ----------------------------------------------------
program
  .command('remove')
  .description('Remove an item by its ID.')
  // The <> brackets indicate a required positional argument
  .argument('<id>', 'The unique ID of the item to remove.') 
  .action((id: string) => {
    console.log(`🗑️ Removing item with ID: ${id}`);
    // Add logic here to remove the item from storage
  });


program
  .command('query')
  .description('Query items.')
  .requiredOption('-q, --query <query>', 'The query string to search for.')
  .action((options: { query: string }) => {
    console.log(`� Querying items with query: "${options.query}"`);
    
    queryData(options.query).then(results => {
      console.log('✅ Query Results:', results);
    });
});

// 5. Parse the command-line arguments passed to the Node.js process
program.parse(process.argv);