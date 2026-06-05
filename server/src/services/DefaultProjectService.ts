import type { PrismaClient } from '@prisma/client';

export const DEFAULT_PROJECT_NAME = 'Default Project';

export async function ensureDefaultProject(prisma: PrismaClient, userId: string) {
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
