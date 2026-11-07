import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCuratorHost,
  resolveClientIdentity,
  type CuratorHost,
} from '@curator/host';
import {
  loadAppConfig,
  profilesFromArgv,
  type AppConfig,
} from '@curator/host/config';
import { StorageService } from '@curator/plugin-storage';
import { ImageProcessorService } from '@curator/plugin-image';
import { GalleryConstant } from './models/index.ts';
import { GalleryRepository } from './services/galleryRepository.ts';
import { Artm2Migrator } from './services/artm2Migrator.ts';
import {
  resolveProjectEmailMappings,
  collectAllConfiguredEmails,
  seedProjectEmailMappings,
  resolveUserProjects,
  type ProjectEmailMapping,
  type SeedProjectEmailsResult,
  type UserProjectAccessDTO,
} from './services/projectAuthSeeder.ts';
import { registerGalleryPlugins } from './plugins/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const galleryRoot = path.dirname(__dirname);

const envCandidates = [
  path.join(galleryRoot, '.env'),
  path.join(process.cwd(), '.env'),
  path.join(galleryRoot, '.env.production'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
      break;
    } catch {}
  }
}

const DEFAULT_CURATOR_DB = path.resolve(galleryRoot, 'data/gallery-curator.db');
const DEFAULT_DATA_DIR = path.resolve(galleryRoot, 'data');

export interface CreateGalleryHostOptions {
  name?: string;
  projectId?: string;
  projectName?: string;
  curatorDbUrl?: string;
  curatorDbPath?: string;
  dataDir?: string;
  mediaPublicUrlPrefix?: string;
  intervalMs?: number;
  quiet?: boolean;
  logLevel?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  actor?: { displayName?: string; interactive?: boolean };
  autoSeed?: boolean;
  forceReset?: boolean;
  configPath?: string;
  profiles?: string | string[];
  durability?: 'durable' | 'ephemeral' | 'checkpoint';
  projectEmails?: Record<string, string[] | { name?: string; emails: string[]; roles?: string[] }>;
}

export interface GalleryAuthConfig {
  jwtSecret?: string;
  defaultManagers: string[];
  googleClientId?: string;
  googleClientSecret?: string;
  googleCallbackUrl?: string;
  frontendUrl?: string;
}

export interface GalleryHost extends CuratorHost {
  galleryRepo: GalleryRepository;
  storageService: StorageService;
  imageProcessor: ImageProcessorService;
  artm2Migrator: Artm2Migrator;
  defaultProjectId: string;
  dataDir: string;
  appConfig: AppConfig;
  authConfig: GalleryAuthConfig;
  projectEmails: Record<string, ProjectEmailMapping>;
  seedProjectEmails: () => Promise<SeedProjectEmailsResult>;
  getUserProjects: (user?: { id?: string; email?: string | null } | null) => Promise<UserProjectAccessDTO[]>;
}

export async function createGalleryHost(
  options: CreateGalleryHostOptions = {}
): Promise<GalleryHost> {
  // 1. Load layered configuration (gallery.config.yaml)
  let appConfig: AppConfig = {
    appId: GalleryConstant.APP_ID,
    activeProfiles: [],
    values: {},
    host: {},
    sources: [],
  };
  try {
    appConfig = loadAppConfig({
      appId: GalleryConstant.APP_ID,
      configPath: options.configPath || process.env.GALLERY_CONFIG,
      profiles: options.profiles || profilesFromArgv(),
      searchDirs: [process.cwd(), galleryRoot],
      envDirs: [process.cwd(), galleryRoot, path.resolve(galleryRoot, '../..')],
    });
  } catch {
    // Optional config file
  }

  // 2. Resolve Project-to-Email & Google OAuth configuration from gallery.config.yaml
  const projectEmails = resolveProjectEmailMappings(appConfig.values, options.projectEmails);
  const allManagerEmails = collectAllConfiguredEmails(appConfig.values, projectEmails);

  const authSection = appConfig.values.auth || {};
  const authConfig: GalleryAuthConfig = {
    jwtSecret:
      process.env.JWT_SECRET ||
      authSection.jwtSecret ||
      'gallery-curator-secret-key-change-me',
    defaultManagers: allManagerEmails,
    googleClientId:
      process.env.GOOGLE_CLIENT_ID || authSection.google?.clientId || undefined,
    googleClientSecret:
      process.env.GOOGLE_CLIENT_SECRET || authSection.google?.clientSecret || undefined,
    googleCallbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      authSection.google?.callbackUrl ||
      'http://localhost:4005/auth/google/callback',
    frontendUrl:
      process.env.FRONTEND_URL ||
      appConfig.values.server?.frontendUrl ||
      'http://localhost:3005',
  };

  // 3. Resolve database & storage paths
  // Ignore root workspace Postgres DATABASE_URL unless explicitly MariaDB/MySQL or CURATOR_DATABASE_URL
  const envDbUrl =
    process.env.CURATOR_DATABASE_URL ||
    process.env.GALLERY_DATABASE_URL ||
    (process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith('mysql://') ||
      process.env.DATABASE_URL.startsWith('mariadb://'))
      ? process.env.DATABASE_URL
      : undefined);

  const rawDbTarget =
    options.curatorDbUrl ||
    options.curatorDbPath ||
    appConfig.values.database?.curatorUrl ||
    envDbUrl ||
    appConfig.values.database?.curatorSqlitePath ||
    process.env.CURATOR_DATABASE_PATH ||
    DEFAULT_CURATOR_DB;

  const isMariaDb =
    typeof rawDbTarget === 'string' &&
    (rawDbTarget.startsWith('mysql://') || rawDbTarget.startsWith('mariadb://'));

  const curatorDbUrl = isMariaDb ? rawDbTarget : options.curatorDbUrl || '';
  const curatorDbPath = isMariaDb
    ? DEFAULT_CURATOR_DB
    : options.curatorDbPath || rawDbTarget || DEFAULT_CURATOR_DB;

  const dataDir = path.resolve(
    options.dataDir ||
      appConfig.values.storage?.dataDir ||
      appConfig.values.dataDir ||
      process.env.DATA_DIR ||
      DEFAULT_DATA_DIR
  );

  const defaultProjectId =
    options.projectId ||
    appConfig.values.gallery?.defaultProjectId ||
    appConfig.values.projectId ||
    process.env.GALLERY_PROJECT_ID ||
    GalleryConstant.DEFAULT_PROJECT_ID;

  const defaultProjectName =
    options.projectName ||
    projectEmails[defaultProjectId]?.name ||
    appConfig.values.gallery?.defaultProjectName ||
    appConfig.values.projectName ||
    GalleryConstant.DEFAULT_PROJECT_NAME;

  if (!options.quiet) {
    if (appConfig.activeProfiles.length > 0) {
      console.log(
        `\x1b[36m[Gallery Host] Profiles:\x1b[0m \x1b[33m${appConfig.activeProfiles.join(', ')}\x1b[0m`
      );
    }
    const maskedTarget = String(rawDbTarget).replace(/:[^:@]+@/, ':****@');
    const dbEngine = isMariaDb ? 'MariaDB/MySQL' : 'SQLite';
    console.log(
      `\x1b[36m[Gallery Host] Database engine:\x1b[0m \x1b[32m${dbEngine}\x1b[0m (${maskedTarget})`
    );
  }

  // 4. Actor resolution
  let actorInfo: { userId?: string; userName?: string; userEmail?: string } = {};
  if (options.actor) {
    const identity = await resolveClientIdentity({
      appId: GalleryConstant.APP_ID,
      displayName: options.actor.displayName,
      interactive: options.actor.interactive,
      fallbackName: GalleryConstant.DEFAULT_ACTOR_NAME,
    });
    actorInfo = {
      userId: identity.userId,
      userName: identity.displayName,
      userEmail: `${identity.userId}@local`,
    };
  }

  // 5. Lazy Prisma getter so services can be wired during plugin registration
  let hostRef: CuratorHost | null = null;
  const getPrisma = () => (hostRef as any)?.definitionsPrisma ?? (hostRef as any)?.prisma;

  const storageService = new StorageService({
    dataDir,
    baseUrlPrefix:
      options.mediaPublicUrlPrefix ||
      appConfig.values.storage?.publicUrlPrefix ||
      '/media',
    defaultProjectId,
    prisma: getPrisma,
  });

  const imageProcessor = new ImageProcessorService();

  const galleryRepo = new GalleryRepository(getPrisma, defaultProjectId);

  const artm2Migrator = new Artm2Migrator({
    repo: galleryRepo,
    storage: storageService,
    imageProcessor,
  });

  const primaryOwnerEmail =
    options.userEmail ??
    actorInfo.userEmail ??
    projectEmails[defaultProjectId]?.emails?.[0] ??
    allManagerEmails[0] ??
    'system@local';

  // 6. Create Curator Host
  const host = await createCuratorHost({
    ...appConfig.host,
    ...(options.durability ? { durability: options.durability } : {}),
    name: options.name ?? GalleryConstant.APP_ID,
    projectId: defaultProjectId,
    projectName: defaultProjectName,
    userId: options.userId ?? actorInfo.userId ?? 'system',
    userName: options.userName ?? actorInfo.userName ?? GalleryConstant.DEFAULT_ACTOR_NAME,
    userEmail: primaryOwnerEmail,
    dataDir,
    curatorDb: {
      url: curatorDbUrl,
      path: curatorDbPath,
      forceReset: options.forceReset,
    },
    intervalMs: options.intervalMs,
    autoSeed: false,
    forceReset: options.forceReset,
    logLevel: (options.logLevel ?? (options.quiet ? 'warn' : undefined)) as any,
    rbac: {
      managers: allManagerEmails,
    },
    registerPlugins: async () => {
      return registerGalleryPlugins({
        repo: galleryRepo,
        storage: storageService,
        imageProcessor,
        migrator: artm2Migrator,
      });
    },
  });

  hostRef = host;

  // Wrap host.seed() so it always seeds both agents/tools and YAML project-to-email RBAC mappings
  const seedProjectEmails = () =>
    seedProjectEmailMappings(getPrisma(), {
      configValues: appConfig.values,
      mappings: projectEmails,
      quiet: options.quiet,
    });

  const baseSeed = host.seed.bind(host);
  host.seed = async () => {
    const res = await baseSeed();
    const authSeed = await seedProjectEmails();
    await (host as any).syncDefinitions?.();
    return Object.assign(res, { authSeed });
  };

  if (options.autoSeed !== false) {
    await host.seed();
  }

  // Ensure default gallery project record exists
  await galleryRepo.ensureProject(defaultProjectId, defaultProjectName);

  const galleryHost = host as GalleryHost;
  galleryHost.galleryRepo = galleryRepo;
  galleryHost.storageService = storageService;
  galleryHost.imageProcessor = imageProcessor;
  galleryHost.artm2Migrator = artm2Migrator;
  galleryHost.defaultProjectId = defaultProjectId;
  galleryHost.dataDir = dataDir;
  galleryHost.appConfig = appConfig;
  galleryHost.authConfig = authConfig;
  galleryHost.projectEmails = projectEmails;
  galleryHost.seedProjectEmails = seedProjectEmails;
  galleryHost.getUserProjects = (user) =>
    resolveUserProjects(getPrisma(), user, projectEmails);

  return galleryHost;
}
