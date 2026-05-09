import { getDMMF } from '@prisma/internals';
import fs from 'fs';
import path from 'path';

async function main() {
  const schemaPath = path.resolve(__dirname, '../../server/prisma/schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  
  const dmmf = await getDMMF({ datamodel: schema });
  
  const outputPath = path.resolve(__dirname, '../src/assets/schema-dmmf.json');
  fs.writeFileSync(outputPath, JSON.stringify(dmmf, null, 2));
  console.log(`DMMF exported to ${outputPath}`);
}

main().catch(console.error);
