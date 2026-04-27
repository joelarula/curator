import * as internals from '@prisma/internals';
for (const key of Object.keys(internals)) {
  console.log(`${key}: ${typeof internals[key]}`);
}
