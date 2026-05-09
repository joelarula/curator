
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Project management functions
export async function getProjects(accountId: number) {
    console.log(`✅ Fetching projects for account ${accountId}`);

    const projects = await prisma.project.findMany({
        where: {
            accountId: accountId
        },
        include: {
            _count: {
                select: { files: true }
            }
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });

    return projects.map(project => ({
        id: project.id,
        name: project.name,
        accountId: project.accountId,
        fileCount: project._count.files,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString()
    }));
}

export async function getProject(projectId: number) {
    console.log(`✅ Fetching project ${projectId}`);

    const project = await prisma.project.findUnique({
        where: {
            id: projectId
        },
        include: {
            _count: {
                select: { files: true }
            }
        }
    });

    if (!project) {
        return null;
    }

    return {
        id: project.id,
        name: project.name,
        accountId: project.accountId,
        fileCount: project._count.files,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString()
    };
}

export async function createProject(name: string, accountId: number) {
    console.log(`✅ Creating project "${name}" for account ${accountId}`);

    const project = await prisma.project.create({
        data: {
            name,
            accountId
        },
        include: {
            _count: {
                select: { files: true }
            }
        }
    });

    return {
        id: project.id,
        name: project.name,
        accountId: project.accountId,
        fileCount: project._count.files,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString()
    };
}

export async function deleteProject(projectId: number) {
    console.log(`✅ Deleting project ${projectId}`);

    // First, get all files for this project
    const files = await prisma.fileData.findMany({
        where: {
            projectId: projectId
        },
        select: {
            id: true
        }
    });

    // Delete all chunks for these files
    for (const file of files) {
        await prisma.chunk.deleteMany({
            where: {
                fileId: file.id
            }
        });
    }

    // Delete all files
    await prisma.fileData.deleteMany({
        where: {
            projectId: projectId
        }
    });

    // Finally, delete the project
    await prisma.project.delete({
        where: {
            id: projectId
        }
    });

    console.log(`✅ Project ${projectId} and all associated data deleted successfully`);
    return true;
}
