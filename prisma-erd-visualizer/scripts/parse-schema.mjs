import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getDMMF } = require('@prisma/internals');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const schemaDir = path.resolve(__dirname, '../../server/prisma/schema');
  if (!fs.existsSync(schemaDir)) {
    console.error(`Schema directory not found at ${schemaDir}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.prisma'));
  let combinedSchema = '';
  for (const file of files) {
    combinedSchema += fs.readFileSync(path.join(schemaDir, file), 'utf-8') + '\n';
  }
  
  const dmmf = await getDMMF({ datamodel: combinedSchema });
  
  const assetsDir = path.resolve(__dirname, '../src/assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const outputPath = path.resolve(assetsDir, 'schema-dmmf.json');
  fs.writeFileSync(outputPath, JSON.stringify(dmmf, null, 2));
  console.log(`DMMF exported to ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
