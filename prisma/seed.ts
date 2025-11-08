import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const defaultTenant = await prisma.tenant.upsert({
    where: { name: 'default' },
    update: {},
    create: {
      name: 'default',
    }
  })

  console.log('Created default tenant:', defaultTenant)

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
      tenantId: defaultTenant.id,
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