import {
  GalleryRole,
  GalleryTool,
  GalleryModule,
  GalleryConstant,
  galleryAppContract,
  type GalleryRoleType,
  type GalleryToolName,
  type GalleryAuthorDTO,
  type GalleryCategoryDTO,
  type GalleryItemDTO,
  type GalleryInfoDTO,
  type GalleryStatsDTO,
} from './models/index.ts';
import {
  GalleryRepository,
  slugifyLink,
} from './services/galleryRepository.ts';
import {
  Artm2Migrator,
  type Artm2MigrationSummary,
} from './services/artm2Migrator.ts';
import {
  resolveProjectEmailMappings,
  collectAllConfiguredEmails,
  seedProjectEmailMappings,
  resolveUserProjects,
  type ProjectEmailMapping,
  type UserProjectAccessDTO,
  type SeedProjectEmailsResult,
} from './services/projectAuthSeeder.ts';
import {
  createToolStep,
  buildMigrateArtm2AST,
  buildIngestArtworkAST,
  buildRegenerateThumbnailsAST,
  GALLERY_WORKFLOW_ASTS,
} from './workflows/index.ts';
import {
  createGalleryPlugin,
  galleryScripts,
  createGalleryTools,
  registerGalleryPlugins,
  type GalleryToolsDeps,
} from './plugins/index.ts';
import {
  createGalleryHost,
  type CreateGalleryHostOptions,
  type GalleryHost,
} from './host.ts';
import {
  executeGraphql,
  schema,
  resolvers,
  type GraphqlContext,
} from './server/graphql.ts';
import { galleryTypeDefs } from './server/schema.ts';
import { createGalleryMcpServer, type CreateGalleryMcpOptions } from './server/mcp.ts';
import { createGalleryApp } from './server/index.ts';
import {
  createGalleryClientShell,
  GALLERY_COMMANDS,
} from './client/galleryClientShell.ts';

export const galleryMiniApp = galleryAppContract;

export {
  GalleryRole,
  GalleryTool,
  GalleryModule,
  GalleryConstant,
  galleryAppContract,
  GalleryRepository,
  slugifyLink,
  Artm2Migrator,
  resolveProjectEmailMappings,
  collectAllConfiguredEmails,
  seedProjectEmailMappings,
  resolveUserProjects,
  createToolStep,
  buildMigrateArtm2AST,
  buildIngestArtworkAST,
  buildRegenerateThumbnailsAST,
  GALLERY_WORKFLOW_ASTS,
  createGalleryPlugin,
  galleryScripts,
  createGalleryTools,
  registerGalleryPlugins,
  createGalleryHost,
  executeGraphql,
  schema,
  resolvers,
  galleryTypeDefs,
  createGalleryMcpServer,
  createGalleryApp,
  createGalleryClientShell,
  GALLERY_COMMANDS,
  type GalleryRoleType,
  type GalleryToolName,
  type GalleryAuthorDTO,
  type GalleryCategoryDTO,
  type GalleryItemDTO,
  type GalleryInfoDTO,
  type GalleryStatsDTO,
  type Artm2MigrationSummary,
  type ProjectEmailMapping,
  type UserProjectAccessDTO,
  type SeedProjectEmailsResult,
  type GalleryToolsDeps,
  type CreateGalleryHostOptions,
  type GalleryHost,
  type GraphqlContext,
  type CreateGalleryMcpOptions,
};
