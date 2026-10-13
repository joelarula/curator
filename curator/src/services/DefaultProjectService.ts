import type { PrismaClient } from '@prisma/client';

export const DEFAULT_PROJECT_NAME = 'Default Project';

export async function ensureDefaultProject(prisma: PrismaClient | any, userId: string) {
  if (!prisma?.project?.findFirst || !prisma?.project?.create) return null;

  const existing = await prisma.project.findFirst({
    where: {
      userId,
      existent: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    return existing;
  }

  return await prisma.project.create({
    data: {
      name: DEFAULT_PROJECT_NAME,
      userId,
      existent: true,
    },
  });
}
