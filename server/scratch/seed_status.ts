import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pkg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pkg
const connectionString = process.env.DATABASE_URL!
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter })

async function main() {
  const statuses = ['NEW', 'ACTIVE', 'ARCHIVED']

  console.log('Seeding SourceStatus...')
  for (const status of statuses) {
    await prisma.sourceStatus.upsert({
      where: { id: status },
      update: {},
      create: { id: status },
    })
    console.log(`- ${status}`)
  }
  console.log('Done seeding SourceStatus.')
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect())
