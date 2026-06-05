import { ensureDefaultProject } from '../services/DefaultProjectService.js';

export const projectResolvers = {
  Query: {
    projects: async (_parent: any, _args: any, context: any) => {
      if (!context.user) throw new Error('Unauthorized');

      await ensureDefaultProject(context.prisma, context.user.id);

      return await context.prisma.project.findMany({
        where: {
          userId: context.user.id,
          existent: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
    },
  },

  Mutation: {
    createProject: async (_parent: any, { name }: { name: string }, context: any) => {
      if (!context.user) throw new Error('Unauthorized');
      const trimmed = (name || '').trim();
      if (!trimmed) throw new Error('Project name is required');

      return await context.prisma.project.create({
        data: {
          name: trimmed,
          userId: context.user.id,
          existent: true,
        },
      });
    },

    deleteProject: async (_parent: any, { id }: { id: string }, context: any) => {
      if (!context.user) throw new Error('Unauthorized');

      const project = await context.prisma.project.findFirst({
        where: {
          id,
          userId: context.user.id,
          existent: true,
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      await context.prisma.project.update({
        where: { id },
        data: {
          existent: false,
          deletedAt: new Date(),
        },
      });

      await ensureDefaultProject(context.prisma, context.user.id);

      return true;
    },
  },
};
