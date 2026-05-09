import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const total = await prisma.source.count()
    const roots = await prisma.source.count({ where: { parentId: null } })
    const withParent = await prisma.source.count({ where: { parentId: { not: null } } })
    
    console.log(`Total Sources: ${total}`)
    console.log(`Root Sources: ${roots}`)
    console.log(`Nested Sources: ${withParent}`)
    
    const rootSample = await prisma.source.findMany({ 
        where: { parentId: null }, 
        take: 5,
        select: { id: true, path: true, materializedPath: true, title: true }
    })
    console.log('Root Sample:', JSON.stringify(rootSample, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
