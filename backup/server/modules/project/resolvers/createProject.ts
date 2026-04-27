import { createProject } from '../projects'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { ERR_NOT_AUTHENTICATED } from '../../../errors'

const connectionString = `${process.env.DATABASE_URL}`
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

export async function createProjectMutation(_: any, { name }: { name: string }, context: any) {
    if (!context.user) {
        throw new Error(ERR_NOT_AUTHENTICATED)
    }

    // Get or create default account for user
    let operator = await prisma.operator.findFirst({
        where: {
            userId: context.user.id
        },
        include: {
            account: true
        }
    })

    // If user has no account, create a default one
    if (!operator) {
        let defaultAccount = await prisma.account.findFirst({
            where: {
                name: 'Default Account'
            }
        })

        if (!defaultAccount) {
            defaultAccount = await prisma.account.create({
                data: {
                    name: 'Default Account'
                }
            })
        }

        let defaultRole = await prisma.role.findFirst({
            where: {
                name: 'Owner'
            }
        })

        if (!defaultRole) {
            defaultRole = await prisma.role.create({
                data: {
                    name: 'Owner',
                    description: 'Account owner with full access'
                }
            })
        }

        operator = await prisma.operator.create({
            data: {
                userId: context.user.id,
                accountId: defaultAccount.id,
                roleId: defaultRole.id
            },
            include: {
                account: true
            }
        })
    }

    return await createProject(name, operator.account.id)
}
