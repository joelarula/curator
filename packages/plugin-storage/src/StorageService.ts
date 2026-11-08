import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export type StorageBucket = 'originals' | 'photos' | 'thumbnails' | 'assets' | string;

export interface StorageServiceOptions {
  /**
   * Base data directory (used when `pathPrefix` is not explicitly provided).
   */
  dataDir?: string;
  /**
   * Configurable filesystem path prefix under which relative storage paths
   * (`<projectSlug>/<bucket>/<filename>`) are stored on disk.
   * Defaults to `process.env.STORAGE_PATH_PREFIX` or `<dataDir>/media`.
   */
  pathPrefix?: string;
  /**
   * Configurable HTTP URL prefix prepended when resolving relative paths
   * to public URLs (e.g. `/media` or `https://cdn.example.com/media`).
   * The database stores ONLY the relative path without this prefix.
   */
  baseUrlPrefix?: string;
  defaultProjectId?: string;
  /**
   * Optional mapping of `projectId -> projectSlug` (folder prefix).
   * If omitted for a project, its folder prefix is derived via `slugifySeo(projectId)`.
   */
  projectSlugs?: Record<string, string>;
  prisma?: any;
}

export interface SaveFileInput {
  projectId?: string;
  bucket?: StorageBucket;
  filename: string;
  slug?: string;
  data: Buffer | Uint8Array | string;
  encoding?: 'base64' | 'utf-8';
  mimeType?: string;
  resourceId?: number;
  attachmentUri?: string;
}

export interface CopyLocalFileInput {
  sourcePath: string;
  projectId?: string;
  bucket?: StorageBucket;
  filename?: string;
  slug?: string;
  mimeType?: string;
  resourceId?: number;
  attachmentUri?: string;
}

export interface StoredFileResult {
  projectId: string;
  /**
   * Project SEO slug and folder prefix (e.g. `artmoments`).
   */
  projectSlug: string;
  bucket: string;
  filename: string;
  /**
   * URL-friendly, SEO-friendly slug generated for the file (e.g. `101-a`) for use in links.
   */
  slug: string;
  /**
   * Environment-independent relative path stored in the database
   * (`<projectSlug>/<bucket>/<filename>`, e.g. `artmoments/photos/101_a.png`).
   */
  relativePath: string;
  /**
   * Resolved filesystem path using the current environment's `pathPrefix`.
   */
  diskPath: string;
  /**
   * Resolved public URL using the current environment's `baseUrlPrefix`.
   */
  url: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  attachmentUri?: string;
}

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
};

const DIACRITIC_MAP: Record<string, string> = {
  ä: 'a',
  ö: 'o',
  ü: 'u',
  õ: 'o',
  š: 's',
  ž: 'z',
  å: 'a',
  æ: 'ae',
  ø: 'o',
  ß: 'ss',
};

/**
 * Generates a URL-friendly, SEO-friendly lowercase hyphenated slug
 * suitable for links, project folder prefixes, and file slugs.
 */
export function slugifySeo(value: string, fallback = 'item'): string {
  const transliterated = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[äöüõšžåæøß]/g, (ch) => DIACRITIC_MAP[ch] || ch)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

/**
 * Generates an SEO-friendly slug from a filename (stripping extension) or title.
 */
export function generateFileSlug(filenameOrTitle: string, fallback = 'file'): string {
  const base = path.basename(String(filenameOrTitle || ''));
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  return slugifySeo(stem || base, fallback);
}

export function inferMimeType(filename: string, fallback = 'application/octet-stream'): string {
  const ext = path.extname(filename || '').toLowerCase();
  return MIME_MAP[ext] || fallback;
}

export function sanitizeSegment(segment: string, fallback = 'default'): string {
  const cleaned = String(segment || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_');
  return cleaned || fallback;
}

export class StorageService {
  public readonly dataDir: string;
  public readonly pathPrefix: string;
  public readonly baseUrlPrefix: string;
  public readonly defaultProjectId: string;
  private projectSlugs: Map<string, string>;
  private prismaGetter: () => any;

  constructor(options: StorageServiceOptions = {}) {
    this.dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || './data');
    const configuredPrefix = options.pathPrefix || process.env.STORAGE_PATH_PREFIX;
    this.pathPrefix = configuredPrefix
      ? path.resolve(configuredPrefix)
      : path.join(this.dataDir, 'media');
    this.baseUrlPrefix = (
      options.baseUrlPrefix ||
      process.env.STORAGE_PUBLIC_URL_PREFIX ||
      '/media'
    ).replace(/\/+$/, '');
    this.defaultProjectId = options.defaultProjectId || 'artmoments';
    this.projectSlugs = new Map<string, string>();
    if (options.projectSlugs) {
      for (const [pid, slug] of Object.entries(options.projectSlugs)) {
        if (pid && slug) {
          this.projectSlugs.set(pid, slugifySeo(slug, slugifySeo(pid)));
        }
      }
    }
    this.prismaGetter = typeof options.prisma === 'function' ? options.prisma : () => options.prisma;
  }

  public setProjectSlug(projectId: string, slug: string): void {
    this.projectSlugs.set(projectId, slugifySeo(slug, slugifySeo(projectId)));
  }

  /**
   * Resolves the owning project ID and its SEO-friendly slug / folder prefix.
   */
  public resolveProjectFolder(projectId?: string): {
    projectId: string;
    projectSlug: string;
  } {
    const rawProject = (projectId || this.defaultProjectId || 'default').trim();
    const mappedSlug = this.projectSlugs.get(rawProject);
    const projectSlug = mappedSlug || slugifySeo(rawProject, 'default');
    return { projectId: rawProject, projectSlug };
  }

  public setPrisma(prismaOrGetter: any): void {
    this.prismaGetter = typeof prismaOrGetter === 'function' ? prismaOrGetter : () => prismaOrGetter;
  }

  public get prisma(): any {
    return this.prismaGetter?.();
  }

  /**
   * Normalizes any stored path, URL, or disk path into an environment-independent
   * relative path (`<projectId>/<bucket>/<filename>`), stripping `pathPrefix`,
   * `baseUrlPrefix`, `/media/`, and leading slashes.
   */
  public toRelativePath(pathOrUrl: string | null | undefined): string {
    if (!pathOrUrl) return '';
    let value = String(pathOrUrl).trim().replace(/\\/g, '/');

    const normalizedPrefix = this.pathPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalizedPrefix && value.toLowerCase().startsWith(normalizedPrefix.toLowerCase() + '/')) {
      value = value.slice(normalizedPrefix.length + 1);
    }

    if (this.baseUrlPrefix && value.startsWith(this.baseUrlPrefix + '/')) {
      value = value.slice(this.baseUrlPrefix.length + 1);
    }

    if (value.startsWith('/media/')) {
      value = value.slice('/media/'.length);
    } else if (value.startsWith('media/')) {
      value = value.slice('media/'.length);
    }

    return value.replace(/^\/+/, '');
  }

  /**
   * Resolves a relative storage path (`<projectId>/<bucket>/<filename>`) to its
   * absolute filesystem path under `this.pathPrefix`, guarding against traversal.
   */
  public resolveDiskPath(relativePath: string): string {
    const rel = this.toRelativePath(relativePath);
    const resolved = path.resolve(this.pathPrefix, rel);
    const rootWithSep = this.pathPrefix.endsWith(path.sep)
      ? this.pathPrefix
      : this.pathPrefix + path.sep;
    if (resolved !== this.pathPrefix && !resolved.startsWith(rootWithSep)) {
      throw new Error(`Invalid storage relative path outside pathPrefix: ${relativePath}`);
    }
    return resolved;
  }

  /**
   * Resolves a relative storage path (`<projectId>/<bucket>/<filename>`) to its
   * public URL using `this.baseUrlPrefix`.
   */
  public resolvePublicUrl(relativePath: string | null | undefined): string | null {
    const rel = this.toRelativePath(relativePath);
    if (!rel) return null;
    const encodedSegments = rel
      .split('/')
      .filter(Boolean)
      .map((seg) => encodeURIComponent(decodeURIComponent(seg)));
    return `${this.baseUrlPrefix}/${encodedSegments.join('/')}`;
  }

  public resolveBucketDir(projectId?: string, bucket: StorageBucket = 'photos'): {
    projectId: string;
    projectSlug: string;
    safeProject: string;
    safeBucket: string;
    bucketDir: string;
  } {
    const { projectId: resolvedProjectId, projectSlug } = this.resolveProjectFolder(projectId);
    const safeBucket = slugifySeo(bucket || 'photos', 'photos');
    const bucketDir = path.join(this.pathPrefix, projectSlug, safeBucket);
    return {
      projectId: resolvedProjectId,
      projectSlug,
      safeProject: projectSlug,
      safeBucket,
      bucketDir,
    };
  }

  public resolveFilePath(
    projectId: string | undefined,
    bucket: StorageBucket,
    filename: string,
    customSlug?: string
  ): {
    projectId: string;
    projectSlug: string;
    safeProject: string;
    safeBucket: string;
    safeFilename: string;
    slug: string;
    relativePath: string;
    diskPath: string;
    url: string;
  } {
    const {
      projectId: resolvedProjectId,
      projectSlug,
      safeBucket,
      bucketDir,
    } = this.resolveBucketDir(projectId, bucket);
    const safeFilename = sanitizeSegment(path.basename(filename), `file_${Date.now()}`);
    const slug = customSlug ? slugifySeo(customSlug) : generateFileSlug(safeFilename);
    const relativePath = `${projectSlug}/${safeBucket}/${safeFilename}`;
    const diskPath = path.join(bucketDir, safeFilename);
    const url = `${this.baseUrlPrefix}/${encodeURIComponent(projectSlug)}/${encodeURIComponent(safeBucket)}/${encodeURIComponent(safeFilename)}`;
    return {
      projectId: resolvedProjectId,
      projectSlug,
      safeProject: projectSlug,
      safeBucket,
      safeFilename,
      slug,
      relativePath,
      diskPath,
      url,
    };
  }

  /**
   * Resolves a file on disk by either its exact filename (`101_a.png`) OR its
   * URL-friendly SEO slug (`101-a` or `101-a.png`).
   */
  public findFileBySlugOrFilename(
    projectId: string | undefined,
    bucket: StorageBucket,
    filenameOrSlug: string
  ): { diskPath: string; filename: string; slug: string } | null {
    const exact = this.resolveFilePath(projectId, bucket, filenameOrSlug);
    if (fs.existsSync(exact.diskPath)) {
      return { diskPath: exact.diskPath, filename: exact.safeFilename, slug: exact.slug };
    }
    const { bucketDir } = this.resolveBucketDir(projectId, bucket);
    if (!fs.existsSync(bucketDir)) return null;

    const requestedSlug = generateFileSlug(filenameOrSlug);
    const requestedExt = path.extname(filenameOrSlug).toLowerCase();
    try {
      const entries = fs.readdirSync(bucketDir);
      for (const entry of entries) {
        const entrySlug = generateFileSlug(entry);
        const entryExt = path.extname(entry).toLowerCase();
        if (entrySlug === requestedSlug && (!requestedExt || entryExt === requestedExt)) {
          return {
            diskPath: path.join(bucketDir, entry),
            filename: entry,
            slug: entrySlug,
          };
        }
      }
    } catch {}
    return null;
  }

  public async ensureBucketDir(projectId?: string, bucket: StorageBucket = 'photos'): Promise<string> {
    const { bucketDir } = this.resolveBucketDir(projectId, bucket);
    await fsp.mkdir(bucketDir, { recursive: true });
    return bucketDir;
  }

  public async saveFile(input: SaveFileInput, overridePrisma?: any): Promise<StoredFileResult> {
    const {
      projectId,
      projectSlug,
      safeBucket,
      safeFilename,
      slug,
      relativePath,
      diskPath,
      url,
    } = this.resolveFilePath(
      input.projectId,
      input.bucket || 'photos',
      input.filename,
      input.slug
    );
    await fsp.mkdir(path.dirname(diskPath), { recursive: true });

    let buffer: Buffer;
    if (Buffer.isBuffer(input.data)) {
      buffer = input.data;
    } else if (input.data instanceof Uint8Array) {
      buffer = Buffer.from(input.data);
    } else if (typeof input.data === 'string') {
      const raw = input.data.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(raw, input.encoding || 'base64');
    } else {
      throw new Error('Invalid file data provided to StorageService.saveFile');
    }

    await fsp.writeFile(diskPath, buffer);
    const mimeType = input.mimeType || inferMimeType(safeFilename);
    const size = buffer.byteLength;

    const attachment = await this.upsertAttachment(
      {
        projectId,
        projectSlug,
        bucket: safeBucket,
        filename: safeFilename,
        slug,
        relativePath,
        mimeType,
        size,
        resourceId: input.resourceId,
        attachmentUri: input.attachmentUri,
      },
      overridePrisma
    );

    return {
      projectId,
      projectSlug,
      bucket: safeBucket,
      filename: safeFilename,
      slug,
      relativePath,
      diskPath,
      url,
      mimeType,
      size,
      attachmentId: attachment?.id,
      attachmentUri: attachment?.uri,
    };
  }

  public async copyLocalFile(input: CopyLocalFileInput, overridePrisma?: any): Promise<StoredFileResult> {
    if (!fs.existsSync(input.sourcePath)) {
      throw new Error(`Source file does not exist: ${input.sourcePath}`);
    }
    const targetName = input.filename || path.basename(input.sourcePath);
    const {
      projectId,
      projectSlug,
      safeBucket,
      safeFilename,
      slug,
      relativePath,
      diskPath,
      url,
    } = this.resolveFilePath(
      input.projectId,
      input.bucket || 'photos',
      targetName,
      input.slug
    );
    await fsp.mkdir(path.dirname(diskPath), { recursive: true });
    await fsp.copyFile(input.sourcePath, diskPath);
    const stat = await fsp.stat(diskPath);
    const mimeType = input.mimeType || inferMimeType(safeFilename);

    const attachment = await this.upsertAttachment(
      {
        projectId,
        projectSlug,
        bucket: safeBucket,
        filename: safeFilename,
        slug,
        relativePath,
        mimeType,
        size: stat.size,
        resourceId: input.resourceId,
        attachmentUri: input.attachmentUri,
      },
      overridePrisma
    );

    return {
      projectId,
      projectSlug,
      bucket: safeBucket,
      filename: safeFilename,
      slug,
      relativePath,
      diskPath,
      url,
      mimeType,
      size: stat.size,
      attachmentId: attachment?.id,
      attachmentUri: attachment?.uri,
    };
  }

  public async registerExistingDiskFile(
    input: {
      projectId?: string;
      bucket: StorageBucket;
      filename: string;
      slug?: string;
      mimeType?: string;
      resourceId?: number;
      attachmentUri?: string;
    },
    overridePrisma?: any
  ): Promise<StoredFileResult> {
    const {
      projectId,
      projectSlug,
      safeBucket,
      safeFilename,
      slug,
      relativePath,
      diskPath,
      url,
    } = this.resolveFilePath(
      input.projectId,
      input.bucket,
      input.filename,
      input.slug
    );
    const stat = await fsp.stat(diskPath);
    const mimeType = input.mimeType || inferMimeType(safeFilename);
    const attachment = await this.upsertAttachment(
      {
        projectId,
        projectSlug,
        bucket: safeBucket,
        filename: safeFilename,
        slug,
        relativePath,
        mimeType,
        size: stat.size,
        resourceId: input.resourceId,
        attachmentUri: input.attachmentUri,
      },
      overridePrisma
    );
    return {
      projectId,
      projectSlug,
      bucket: safeBucket,
      filename: safeFilename,
      slug,
      relativePath,
      diskPath,
      url,
      mimeType,
      size: stat.size,
      attachmentId: attachment?.id,
      attachmentUri: attachment?.uri,
    };
  }

  public async upsertAttachment(
    params: {
      projectId: string;
      projectSlug?: string;
      bucket: string;
      filename: string;
      slug?: string;
      relativePath?: string;
      url?: string;
      mimeType: string;
      size: number;
      resourceId?: number;
      attachmentUri?: string;
    },
    overridePrisma?: any
  ): Promise<{ id: string; uri: string; slug: string } | null> {
    const db = overridePrisma || this.prisma;
    if (!db?.attachment) return null;

    const { projectId, projectSlug } = this.resolveProjectFolder(params.projectId);
    const folderPrefix = params.projectSlug || projectSlug;
    const slug = params.slug ? slugifySeo(params.slug) : generateFileSlug(params.filename);
    const uri =
      params.attachmentUri || `attachment:${projectId}:${params.bucket}:${params.filename}`;
    // Store ONLY the relative path (`<projectSlug>/<bucket>/<filename>`) in the database
    const relativeUrl =
      this.toRelativePath(params.relativePath || params.url) ||
      `${folderPrefix}/${params.bucket}/${params.filename}`;

    try {
      const record = await db.attachment.upsert({
        where: { uri },
        update: {
          filename: params.filename,
          slug,
          projectId,
          mimetype: params.mimeType,
          url: relativeUrl,
          size: params.size,
          existent: true,
          ...(params.resourceId !== undefined ? { resourceId: params.resourceId } : {}),
        },
        create: {
          uri,
          filename: params.filename,
          slug,
          projectId,
          mimetype: params.mimeType,
          url: relativeUrl,
          size: params.size,
          existent: true,
          ...(params.resourceId !== undefined ? { resourceId: params.resourceId } : {}),
        },
      });
      return { id: record.id, uri: record.uri, slug: record.slug || slug };
    } catch {
      return null;
    }
  }

  public async listFiles(options: { projectId?: string; bucket?: StorageBucket } = {}): Promise<StoredFileResult[]> {
    const { projectId, projectSlug, safeBucket, bucketDir } = this.resolveBucketDir(
      options.projectId,
      options.bucket || 'photos'
    );
    if (!fs.existsSync(bucketDir)) return [];
    const entries = await fsp.readdir(bucketDir, { withFileTypes: true });
    const results: StoredFileResult[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const slug = generateFileSlug(entry.name);
      const relativePath = `${projectSlug}/${safeBucket}/${entry.name}`;
      const diskPath = path.join(bucketDir, entry.name);
      const stat = await fsp.stat(diskPath);
      const url = `${this.baseUrlPrefix}/${encodeURIComponent(projectSlug)}/${encodeURIComponent(safeBucket)}/${encodeURIComponent(entry.name)}`;
      results.push({
        projectId,
        projectSlug,
        bucket: safeBucket,
        filename: entry.name,
        slug,
        relativePath,
        diskPath,
        url,
        mimeType: inferMimeType(entry.name),
        size: stat.size,
      });
    }
    return results;
  }

  public async deleteFile(
    options: {
      projectId?: string;
      bucket?: StorageBucket;
      filename: string;
      attachmentUri?: string;
    },
    overridePrisma?: any
  ): Promise<{ deletedDisk: boolean; deletedAttachment: boolean }> {
    const { safeProject, safeBucket, safeFilename, diskPath } = this.resolveFilePath(
      options.projectId,
      options.bucket || 'photos',
      options.filename
    );
    let deletedDisk = false;
    if (fs.existsSync(diskPath)) {
      await fsp.unlink(diskPath);
      deletedDisk = true;
    }

    let deletedAttachment = false;
    const db = overridePrisma || this.prisma;
    if (db?.attachment) {
      const uri = options.attachmentUri || `attachment:${safeProject}:${safeBucket}:${safeFilename}`;
      try {
        await db.attachment.updateMany({
          where: { uri },
          data: { existent: false },
        });
        deletedAttachment = true;
      } catch {}
    }

    return { deletedDisk, deletedAttachment };
  }
}

