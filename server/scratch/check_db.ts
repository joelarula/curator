import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const count = await prisma.source.count()
  console.log('Total Sources:', count)
  const sample = await prisma.source.findMany({ take: 5 })
  console.log('Sample Sources:', JSON.stringify(sample, null, 2))
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect())
