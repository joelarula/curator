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
  const lookups = {
    sourceType: ['WEB', 'BOOK', 'WIKI_PAGE', 'ARTICLE', 'DOCUMENT'],
    sourceStatus: ['NEW', 'ACTIVE', 'ARCHIVED'],
    textRole: ['MAIN', 'SUMMARY', 'TRANSCRIPT', 'ANALYSIS'],
    relationRole: ['REFERENCE', 'ORIGIN', 'CITATION', 'FEATURE', 'SPECIMEN', 'LINK', 'SUMMARY'],
  }

  console.log('Seeding Lookup Tables...')

  for (const [table, values] of Object.entries(lookups)) {
    console.log(`\nSeeding ${table}...`)
    for (const val of values) {
      await (prisma as any)[table].upsert({
        where: { id: val },
        update: {},
        create: { id: val },
      })
      console.log(`- ${val}`)
    }
  }

  console.log('\nDone seeding lookup tables.')
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect())
