import { SemanticDslEngine } from '../services/SemanticDslEngine.js';
import { ensureDefaultProject } from '../services/DefaultProjectService.js';

export const dslResolvers = {
  Query: {
    dslModels: async (_parent: any, _args: any, context: any) => {
      if (!context.user) throw new Error('Unauthorized');
      const engine = SemanticDslEngine.getInstance(context.prisma);
      let projectId = context.activeProjectId;
      if (!projectId) {
        const defaultProj = await ensureDefaultProject(context.prisma, context.user.id);
        projectId = defaultProj.id;
      }
      const ctx = await engine.getEngineContext(projectId);
      return ctx.models;
    },

    loadDslEntity: async (
      _parent: any,
      { modelName, subjectUri }: { modelName: string; subjectUri: string },
      context: any
    ) => {
      if (!context.user) throw new Error('Unauthorized');
      const engine = SemanticDslEngine.getInstance(context.prisma);
      let projectId = context.activeProjectId;
      if (!projectId) {
        const defaultProj = await ensureDefaultProject(context.prisma, context.user.id);
        projectId = defaultProj.id;
      }
      return await engine.loadEntity(modelName, subjectUri, projectId);
    },

    dslSchemas: async (_parent: any, _args: any, context: any) => {
      if (!context.user) throw new Error('Unauthorized');
      let projectId = context.activeProjectId;
      if (!projectId) {
        const defaultProj = await ensureDefaultProject(context.prisma, context.user.id);
        projectId = defaultProj.id;
      }
      return await context.prisma.dslSchema.findMany({
        where: {
          OR: [
            { projectId },
            { projectId: 'system' },
            { projectId: null }
          ],
          existent: true
        },
        orderBy: { updatedAt: 'desc' },
      });
    },

    listDslEntities: async (
      _parent: any,
      { modelName }: { modelName: string },
      context: any
    ) => {
      if (!context.user) throw new Error('Unauthorized');
      const engine = SemanticDslEngine.getInstance(context.prisma);
      let projectId = context.activeProjectId;
      if (!projectId) {
        const defaultProj = await ensureDefaultProject(context.prisma, context.user.id);
        projectId = defaultProj.id;
      }
      return await engine.listEntities(modelName, projectId);
    },
  },

  Mutation: {
    saveDslEntity: async (
      _parent: any,
      { modelName, data }: { modelName: string; data: any },
      context: any
    ) => {
      if (!context.user) throw new Error('Unauthorized');
      const engine = SemanticDslEngine.getInstance(context.prisma);
      let projectId = context.activeProjectId;
      if (!projectId) {
        const defaultProj = await ensureDefaultProject(context.prisma, context.user.id);
        projectId = defaultProj.id;
      }
      const userId = context.user.id;
      return await engine.saveEntity(modelName, data, userId, projectId);
    },

    saveDslSchema: async (
      _parent: any,
      { name, type, definition }: { name: string; type: string; definition: string },
      context: any
    ) => {
      if (!context.user) throw new Error('Unauthorized');
      let projectId = context.activeProjectId;
      if (!projectId) {
        const defaultProj = await ensureDefaultProject(context.prisma, context.user.id);
        projectId = defaultProj.id;
      }

      const schema = await context.prisma.dslSchema.upsert({
        where: {
          projectId_name: {
            projectId,
            name,
          },
        },
        update: {
          type,
          definition,
          existent: true,
        },
        create: {
          name,
          type,
          definition,
          projectId,
          existent: true,
        },
      });

      // Synchronize ontology/metamodels for this project-specific schema
      const engine = SemanticDslEngine.getInstance(context.prisma);
      const ctx = await engine.getEngineContext(projectId);
      await engine.syncOntologyForContext(ctx, context.user.id, projectId);

      return schema;
    },

    deleteDslSchema: async (
      _parent: any,
      { name }: { name: string },
      context: any
    ) => {
      if (!context.user) throw new Error('Unauthorized');
      let projectId = context.activeProjectId;
      if (!projectId) {
        const defaultProj = await ensureDefaultProject(context.prisma, context.user.id);
        projectId = defaultProj.id;
      }

      await context.prisma.dslSchema.update({
        where: {
          projectId_name: {
            projectId,
            name,
          },
        },
        data: {
          existent: false,
        },
      });
      return true;
    },

    deleteDslEntity: async (
      _parent: any,
      { modelName, subjectUri }: { modelName: string; subjectUri: string },
      context: any
    ) => {
      if (!context.user) throw new Error('Unauthorized');
      const engine = SemanticDslEngine.getInstance(context.prisma);
      let projectId = context.activeProjectId;
      if (!projectId) {
        const defaultProj = await ensureDefaultProject(context.prisma, context.user.id);
        projectId = defaultProj.id;
      }
      return await engine.deleteEntity(modelName, subjectUri, projectId);
    },
  },
};
