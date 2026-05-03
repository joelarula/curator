import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient()

async function main() {
  // Seed application user 'curator'
  const curator = await prisma.user.upsert({
    where: { email: 'curator@arula.dev' },
    update: {},
    create: {
      email: 'curator@arula.dev',
      name: 'curator',
    },
  })

  // Seed lookup tables
  await prisma.textRole.createMany({
    data: [
      { name: 'MAIN' },
      { name: 'SUMMARY' },
      { name: 'TRANSCRIPT' },
    ],
    skipDuplicates: true,
  })




}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  })
