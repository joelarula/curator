import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { defaultAllowedOrigins } from 'vite'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const defaultAccount = await prisma.account.upsert({
    where: { name: 'default' },
    update: {},
    create: {
      name: 'default',
    }
  })

  console.log('Created default account:', defaultAccount)

  const model = await prisma.model.upsert({
    where: { name: 'Xenova/all-MiniLM-L6-v2' },
    update: {},
    create: {
      name: 'Xenova/all-MiniLM-L6-v2',
      columnName: 'xenova_all_minilm_l6_v2'
    }
  })

  console.log('Created model:', model)


  const project = await prisma.project.upsert({
    where: { name: "default" },
    update: {},
    create: {
      name: "default",
      accountId: defaultAccount.id,
    }
  });


}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })