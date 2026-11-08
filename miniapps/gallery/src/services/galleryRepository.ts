import crypto from 'node:crypto';
import {
  slugifySeo,
  generateFileSlug,
  type StorageService,
} from '@curator/plugin-storage';
import {
  GalleryConstant,
  type GalleryAuthorDTO,
  type GalleryCategoryDTO,
  type GalleryItemDTO,
  type GalleryInfoDTO,
  type GalleryStatsDTO,
  type GalleryPageDTO,
  type GalleryPhotoStepDTO,
  type GallerySeoImageDTO,
  type GallerySeoMetaDTO,
  type GallerySeoRouteDTO,
  type GallerySeoItemEntryDTO,
  type GallerySeoIndexDTO,
} from '../models/index.ts';

function parseMeta(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, any>;
  return {};
}

export function slugifyLink(text: string): string {
  return slugifySeo(text, 'item');
}

/**
 * Repository operating directly on Curator Core Database models:
 * Project, Resource, Attachment, Relation, ResourceTree, Text.
 * All queries are scoped to [projectId, 'system'].
 * File references in the database store ONLY relative storage paths
 * (`<projectId>/<bucket>/<filename>`) so database + files can be migrated
 * between environments without modifying database records.
 */
export class GalleryRepository {
  private prismaGetter: () => any;
  public readonly defaultProjectId: string;
  private storage?: StorageService;
  public readonly publicUrlPrefix: string;

  constructor(
    prismaOrGetter: any,
    defaultProjectId: string = GalleryConstant.DEFAULT_PROJECT_ID,
    storage?: StorageService,
    publicUrlPrefix?: string
  ) {
    this.prismaGetter = typeof prismaOrGetter === 'function' ? prismaOrGetter : () => prismaOrGetter;
    this.defaultProjectId = defaultProjectId;
    this.storage = storage;
    this.publicUrlPrefix = (
      publicUrlPrefix ||
      storage?.baseUrlPrefix ||
      process.env.STORAGE_PUBLIC_URL_PREFIX ||
      '/media'
    ).replace(/\/+$/, '');
  }

  /**
   * Strips any filesystem `pathPrefix` or HTTP `publicUrlPrefix` so only the
   * environment-independent relative path (`<projectId>/<bucket>/<filename>`)
   * is persisted in the database.
   */
  public toRelativeStoragePath(
    pathOrUrl: string | null | undefined,
    fallbackRelative: string | null = null
  ): string | null {
    const raw = pathOrUrl || fallbackRelative;
    if (!raw) return null;
    if (this.storage) {
      const rel = this.storage.toRelativePath(raw);
      return rel || fallbackRelative;
    }
    let val = String(raw).trim().replace(/\\/g, '/');
    if (this.publicUrlPrefix && val.startsWith(this.publicUrlPrefix + '/')) {
      val = val.slice(this.publicUrlPrefix.length + 1);
    }
    if (val.startsWith('/media/')) {
      val = val.slice('/media/'.length);
    } else if (val.startsWith('media/')) {
      val = val.slice('media/'.length);
    }
    val = val.replace(/^\/+/, '');
    return val || fallbackRelative;
  }

  /**
   * Resolves a stored relative path into the active environment's public URL.
   */
  public resolvePublicUrl(
    relativeOrUrl: string | null | undefined,
    fallbackRelative: string | null = null
  ): string | null {
    const rel = this.toRelativeStoragePath(relativeOrUrl, fallbackRelative);
    if (!rel) return null;
    if (this.storage) {
      return this.storage.resolvePublicUrl(rel);
    }
    return `${this.publicUrlPrefix}/${rel}`;
  }

  public get prisma(): any {
    const db = this.prismaGetter();
    if (!db) throw new Error('Curator Prisma client is not initialized yet.');
    return db;
  }

  public resolveScope(projectId?: string): { projectId: string; projectSlug: string; scopes: string[] } {
    const active = (projectId || this.defaultProjectId).trim() || GalleryConstant.DEFAULT_PROJECT_ID;
    const projectSlug = this.storage
      ? this.storage.resolveProjectFolder(active).projectSlug
      : slugifySeo(active, 'default');
    const scopes = active === 'system' ? ['system'] : [active, 'system'];
    return { projectId: active, projectSlug, scopes };
  }

  public async ensureProject(
    projectId?: string,
    projectName?: string
  ): Promise<{ userId: string; projectId: string; projectSlug: string }> {
    const { projectId: pid, projectSlug } = this.resolveScope(projectId);
    const db = this.prisma;

    const user = await db.user.upsert({
      where: { email: 'system@local' },
      update: {},
      create: { id: 'system', email: 'system@local', name: 'System User' },
    });

    await db.project.upsert({
      where: { id: 'system' },
      update: { slug: 'system', existent: true },
      create: { id: 'system', name: 'System', slug: 'system', userId: user.id, existent: true },
    });

    await db.project.upsert({
      where: { id: pid },
      update: { slug: projectSlug, existent: true },
      create: {
        id: pid,
        name: projectName || GalleryConstant.DEFAULT_PROJECT_NAME,
        slug: projectSlug,
        userId: user.id,
        existent: true,
      },
    });

    return { userId: user.id, projectId: pid, projectSlug };
  }

  private async ensurePredicate(uri: string, title: string, userId: string): Promise<number> {
    const res = await this.prisma.resource.upsert({
      where: { uri },
      update: { existent: true },
      create: {
        uri,
        title,
        isPublished: true,
        userId,
        projectId: 'system',
        existent: true,
        metadata: { entityType: 'predicate' },
      },
    });
    return res.id;
  }

  // ---------------------------------------------------------------------------
  // Authors (Curator Resource with uri = "author:<projectId>:<key>")
  // ---------------------------------------------------------------------------
  public async upsertAuthor(input: {
    projectId?: string;
    key: string;
    name: string;
    link?: string;
    bio?: string;
  }): Promise<GalleryAuthorDTO> {
    const { userId, projectId } = await this.ensureProject(input.projectId);
    const key = String(input.key).trim().toUpperCase();
    const link = input.link ? String(input.link).trim() : slugifyLink(input.name || key);
    const uri = `author:${projectId}:${key}`;

    await this.prisma.resource.upsert({
      where: { uri },
      update: {
        title: input.name,
        description: input.bio ?? null,
        isPublished: true,
        projectId,
        existent: true,
        deletedAt: null,
        metadata: {
          entityType: 'author',
          key,
          name: input.name,
          link,
          bio: input.bio ?? null,
        },
      },
      create: {
        uri,
        title: input.name,
        description: input.bio ?? null,
        isPublished: true,
        userId,
        projectId,
        existent: true,
        metadata: {
          entityType: 'author',
          key,
          name: input.name,
          link,
          bio: input.bio ?? null,
        },
      },
    });

    return {
      key,
      name: input.name,
      link,
      bio: input.bio ?? null,
      paintingCount: 0,
    };
  }

  public async listAuthors(options: { projectId?: string } = {}): Promise<GalleryAuthorDTO[]> {
    const { projectId, scopes } = this.resolveScope(options.projectId);
    const prefix = `author:${projectId}:`;

    const [authorResources, paintingResources] = await Promise.all([
      this.prisma.resource.findMany({
        where: {
          projectId: { in: scopes },
          uri: { startsWith: prefix },
          existent: true,
          deletedAt: null,
        },
      }),
      this.prisma.resource.findMany({
        where: {
          projectId: { in: scopes },
          uri: { startsWith: `painting:${projectId}:` },
          existent: true,
          deletedAt: null,
          isPublished: true,
        },
        select: { metadata: true },
      }),
    ]);

    const countsByAuthor: Record<string, number> = {};
    for (const p of paintingResources) {
      const m = parseMeta(p.metadata);
      const aKey = String(m.authorKey || '').toUpperCase();
      if (aKey) countsByAuthor[aKey] = (countsByAuthor[aKey] || 0) + 1;
    }

    const dtos: GalleryAuthorDTO[] = authorResources.map((r: any) => {
      const m = parseMeta(r.metadata);
      const key = String(m.key || r.uri.slice(prefix.length)).toUpperCase();
      const name = r.title || m.name || key;
      const link = m.link || slugifyLink(name || key);
      const bio = r.description || m.bio || null;
      const paintingCount = countsByAuthor[key] || 0;
      const canonicalPath = `/author/${link}`;
      const title = `${name} — Maalid (${paintingCount}) | Artmoments`;
      const description = bio || `Autori ${name} akrüülmaalid lõuendil (${paintingCount} teost).`;
      const lastModified =
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt || '');
      return {
        key,
        name,
        link,
        bio,
        paintingCount,
        seo: {
          title,
          description,
          keywords: [name, link, 'kunstnik', 'akrüülmaalid', 'Artmoments'],
          canonicalPath,
          canonicalUrl: canonicalPath,
          robots: 'index, follow',
          ogType: 'website',
          ogTitle: title,
          ogDescription: description,
          ogImage: null,
          ogImageWidth: null,
          ogImageHeight: null,
          ogImageAlt: name,
          locale: 'et_EE',
          lastModified,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: title,
            description,
            url: canonicalPath,
            about: {
              '@type': 'Person',
              name,
              description: bio || undefined,
            },
          },
        },
      };
    });

    dtos.sort((a, b) => b.paintingCount - a.paintingCount || a.name.localeCompare(b.name));
    return dtos;
  }

  // ---------------------------------------------------------------------------
  // Categories (Curator Resource + ResourceTree)
  // ---------------------------------------------------------------------------
  public async upsertCategory(input: {
    projectId?: string;
    key: string;
    name: string;
    nameEn?: string | null;
    link?: string;
    published?: boolean;
    exposed?: boolean;
    sortOrder?: number;
  }): Promise<GalleryCategoryDTO> {
    const { userId, projectId } = await this.ensureProject(input.projectId);
    const key = String(input.key).trim().toUpperCase();
    const link = input.link ? String(input.link).trim() : slugifyLink(input.name || key);
    const published = input.published ?? true;
    const exposed = input.exposed ?? published;
    const sortOrder = input.sortOrder ?? 0;
    const uri = `category:${projectId}:${key}`;

    const catRes = await this.prisma.resource.upsert({
      where: { uri },
      update: {
        title: input.name,
        description: input.nameEn ?? null,
        isPublished: Boolean(published),
        projectId,
        existent: true,
        deletedAt: null,
        metadata: {
          entityType: 'category',
          key,
          name: input.name,
          nameEn: input.nameEn ?? null,
          link,
          published: Boolean(published),
          exposed: Boolean(exposed),
          sortOrder,
        },
      },
      create: {
        uri,
        title: input.name,
        description: input.nameEn ?? null,
        isPublished: Boolean(published),
        userId,
        projectId,
        existent: true,
        metadata: {
          entityType: 'category',
          key,
          name: input.name,
          nameEn: input.nameEn ?? null,
          link,
          published: Boolean(published),
          exposed: Boolean(exposed),
          sortOrder,
        },
      },
    });

    // Maintain ResourceTree hierarchy node for category navigation
    const treeName = `gallery:categories:${projectId}`;
    await this.prisma.resourceTree.upsert({
      where: {
        treeName_resourceId: {
          treeName,
          resourceId: catRes.id,
        },
      },
      update: {
        treeStart: sortOrder,
        treeEnd: sortOrder + 1,
        depth: 0,
        projectId,
        existent: true,
        deletedAt: null,
      },
      create: {
        treeName,
        resourceId: catRes.id,
        treeStart: sortOrder,
        treeEnd: sortOrder + 1,
        depth: 0,
        projectId,
        existent: true,
      },
    });

    return {
      key,
      name: input.name,
      nameEn: input.nameEn ?? null,
      link,
      published: Boolean(published),
      exposed: Boolean(exposed),
      sortOrder,
      paintingCount: 0,
    };
  }

  public async listCategories(
    options: { projectId?: string; includeUnpublished?: boolean } = {}
  ): Promise<GalleryCategoryDTO[]> {
    const { projectId, scopes } = this.resolveScope(options.projectId);
    const prefix = `category:${projectId}:`;

    const [catResources, paintingResources] = await Promise.all([
      this.prisma.resource.findMany({
        where: {
          projectId: { in: scopes },
          uri: { startsWith: prefix },
          existent: true,
          deletedAt: null,
        },
      }),
      this.prisma.resource.findMany({
        where: {
          projectId: { in: scopes },
          uri: { startsWith: `painting:${projectId}:` },
          existent: true,
          deletedAt: null,
          isPublished: true,
        },
        select: { metadata: true },
      }),
    ]);

    const countsByCat: Record<string, number> = {};
    for (const p of paintingResources) {
      const m = parseMeta(p.metadata);
      const cKeys: string[] = Array.isArray(m.categoryKeys) ? m.categoryKeys : [];
      for (const ck of cKeys) {
        const norm = String(ck).toUpperCase();
        countsByCat[norm] = (countsByCat[norm] || 0) + 1;
      }
    }

    let dtos: GalleryCategoryDTO[] = catResources.map((r: any) => {
      const m = parseMeta(r.metadata);
      const key = String(m.key || r.uri.slice(prefix.length)).toUpperCase();
      const published = Boolean(r.isPublished ?? m.published);
      const exposed = Boolean(m.exposed ?? published);
      const name = r.title || m.name || key;
      const nameEn = m.nameEn || r.description || null;
      const link = m.link || slugifyLink(r.title || key);
      const paintingCount = countsByCat[key] || 0;
      const canonicalPath = `/category/${link}`;
      const title = `${name}${nameEn ? ` / ${nameEn}` : ''} — Maalid (${paintingCount}) | Artmoments`;
      const description = `Kategooria "${name}" akrüülmaalid lõuendil (${paintingCount} teost). Dekoratiivmaalide valmistamine ja müük.`;
      const lastModified =
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt || '');
      return {
        key,
        name,
        nameEn,
        link,
        published,
        exposed,
        sortOrder: Number(m.sortOrder || 0),
        paintingCount,
        seo: {
          title,
          description,
          keywords: [name, ...(nameEn ? [nameEn] : []), link, 'akrüülmaalid', 'Artmoments'],
          canonicalPath,
          canonicalUrl: canonicalPath,
          robots: published ? 'index, follow' : 'noindex, nofollow',
          ogType: 'website',
          ogTitle: title,
          ogDescription: description,
          ogImage: null,
          ogImageWidth: null,
          ogImageHeight: null,
          ogImageAlt: name,
          locale: 'et_EE',
          lastModified,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: title,
            description,
            url: canonicalPath,
          },
        },
      };
    });

    if (!options.includeUnpublished) {
      dtos = dtos.filter((c) => c.published || c.exposed);
    }

    dtos.sort((a, b) => b.paintingCount - a.paintingCount || a.name.localeCompare(b.name));
    return dtos;
  }

  // ---------------------------------------------------------------------------
  // Artworks / Gallery Items (Curator Resource + Attachment + Relation)
  // ---------------------------------------------------------------------------
  public async upsertItem(input: {
    projectId?: string;
    key: string;
    name: string;
    link?: string;
    photo?: string | null;
    photoUrl?: string | null;
    thumbnailUrl?: string | null;
    authorKey?: string;
    categoryKeys?: string[];
    published?: boolean;
    description?: string | null;
    width?: number | null;
    height?: number | null;
    size?: number | null;
    metadata?: Record<string, any>;
    syncRelations?: boolean;
  }): Promise<GalleryItemDTO> {
    const { userId, projectId, projectSlug } = await this.ensureProject(input.projectId);
    const key = String(input.key).trim();
    const uri = `painting:${projectId}:${key}`;

    // Merge with existing metadata if partial update
    const existing = await this.prisma.resource.findUnique({
      where: { uri },
      include: { attachments: true },
    });
    const prevMeta = parseMeta(existing?.metadata);

    const name = input.name ?? existing?.title ?? key;
    const link = slugifyLink(input.link ?? prevMeta.link ?? name);
    const slug = slugifySeo(link || name || key);
    const photo = input.photo !== undefined ? input.photo : (prevMeta.photo ?? (link ? `${link}.png` : null));
    const photoSlug = photo ? generateFileSlug(photo, slug) : slug;
    const defaultPhotoRel = photo ? `${projectSlug}/photos/${photo}` : null;
    const photoPath = this.toRelativeStoragePath(
      input.photoUrl !== undefined ? input.photoUrl : (prevMeta.photoPath ?? prevMeta.photoUrl),
      defaultPhotoRel
    );
    const thumbFile = photo ? `${photo.replace(/\.[^.]+$/, '')}.jpg` : null;
    const thumbSlug = thumbFile ? generateFileSlug(thumbFile, slug) : slug;
    const defaultThumbRel = thumbFile ? `${projectSlug}/thumbnails/${thumbFile}` : photoPath;
    const thumbnailPath = this.toRelativeStoragePath(
      input.thumbnailUrl !== undefined ? input.thumbnailUrl : (prevMeta.thumbnailPath ?? prevMeta.thumbnailUrl),
      defaultThumbRel
    );
    const authorKey = String(input.authorKey ?? prevMeta.authorKey ?? 'ANON').toUpperCase();
    const categoryKeys: string[] = Array.isArray(input.categoryKeys)
      ? input.categoryKeys.map((c) => String(c).toUpperCase())
      : Array.isArray(prevMeta.categoryKeys)
        ? prevMeta.categoryKeys
        : [];
    const published = input.published !== undefined ? Boolean(input.published) : Boolean(existing?.isPublished ?? true);
    const description = input.description !== undefined ? input.description : (existing?.description ?? null);

    // Store ONLY relative paths (`<projectSlug>/<bucket>/<filename>`) and SEO slugs in DB metadata
    const nextMeta = {
      ...prevMeta,
      ...(input.metadata || {}),
      entityType: 'painting',
      key,
      name,
      link,
      slug,
      projectSlug,
      photo,
      photoSlug,
      photoPath,
      thumbnailPath,
      photoUrl: photoPath,
      thumbnailUrl: thumbnailPath,
      authorKey,
      categoryKeys,
      published,
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      ...(input.size !== undefined ? { size: input.size } : {}),
    };

    const resource = await this.prisma.resource.upsert({
      where: { uri },
      update: {
        title: name,
        description,
        isPublished: published,
        projectId,
        existent: true,
        deletedAt: null,
        metadata: nextMeta,
      },
      create: {
        uri,
        title: name,
        description,
        isPublished: published,
        userId,
        projectId,
        existent: true,
        metadata: nextMeta,
      },
    });

    // Upsert Attachment rows belonging to `projectId` with SEO `slug` and relative path (`<projectSlug>/<bucket>/<filename>`)
    if (photo && photoPath) {
      const photoAttUri = `attachment:${projectId}:photos:${photo}`;
      await this.prisma.attachment.upsert({
        where: { uri: photoAttUri },
        update: {
          resourceId: resource.id,
          projectId,
          slug: photoSlug,
          filename: photo,
          mimetype: photo.endsWith('.png') ? 'image/png' : 'image/jpeg',
          url: photoPath,
          size: Number(nextMeta.size || 0),
          existent: true,
        },
        create: {
          resourceId: resource.id,
          projectId,
          slug: photoSlug,
          uri: photoAttUri,
          filename: photo,
          mimetype: photo.endsWith('.png') ? 'image/png' : 'image/jpeg',
          url: photoPath,
          size: Number(nextMeta.size || 0),
          existent: true,
        },
      });
    }

    if (thumbFile && thumbnailPath) {
      const thumbAttUri = `attachment:${projectId}:thumbnails:${thumbFile}`;
      await this.prisma.attachment.upsert({
        where: { uri: thumbAttUri },
        update: {
          resourceId: resource.id,
          projectId,
          slug: thumbSlug,
          filename: thumbFile,
          mimetype: 'image/jpeg',
          url: thumbnailPath,
          size: 0,
          existent: true,
        },
        create: {
          resourceId: resource.id,
          projectId,
          slug: thumbSlug,
          uri: thumbAttUri,
          filename: thumbFile,
          mimetype: 'image/jpeg',
          url: thumbnailPath,
          size: 0,
          existent: true,
        },
      });
    }

    // Optionally sync semantic Relations (author & categories)
    if (input.syncRelations !== false) {
      try {
        const [authorPredId, catPredId] = await Promise.all([
          this.ensurePredicate('schema:author', 'author', userId),
          this.ensurePredicate('schema:isPartOf', 'isPartOf', userId),
        ]);

        const authorRes = await this.prisma.resource.findUnique({
          where: { uri: `author:${projectId}:${authorKey}` },
        });
        if (authorRes) {
          await this.prisma.relation.upsert({
            where: {
              subjectId_predicateId_objectId: {
                subjectId: resource.id,
                predicateId: authorPredId,
                objectId: authorRes.id,
              },
            },
            update: { existent: true, projectId },
            create: {
              subjectId: resource.id,
              predicateId: authorPredId,
              objectId: authorRes.id,
              projectId,
              existent: true,
            },
          });
        }

        for (const catKey of categoryKeys) {
          const catRes = await this.prisma.resource.findUnique({
            where: { uri: `category:${projectId}:${catKey}` },
          });
          if (catRes) {
            await this.prisma.relation.upsert({
              where: {
                subjectId_predicateId_objectId: {
                  subjectId: resource.id,
                  predicateId: catPredId,
                  objectId: catRes.id,
                },
              },
              update: { existent: true, projectId },
              create: {
                subjectId: resource.id,
                predicateId: catPredId,
                objectId: catRes.id,
                projectId,
                existent: true,
              },
            });
          }
        }
      } catch {}
    }

    if (input.syncRelations !== false) {
      const hydrated = await this.getItem({ projectId, keyOrLink: key });
      if (hydrated) return hydrated;
    }
    return this.mapResourceToItemDTO(resource, new Map(), new Map(), projectId);
  }

  private mapResourceToItemDTO(
    r: any,
    authorsMap: Map<string, GalleryAuthorDTO>,
    categoriesMap: Map<string, GalleryCategoryDTO>,
    projectId: string
  ): GalleryItemDTO {
    const m = parseMeta(r.metadata);
    const { projectSlug } = this.resolveScope(projectId);
    const prefix = `painting:${projectId}:`;
    const key = String(m.key || (r.uri?.startsWith(prefix) ? r.uri.slice(prefix.length) : r.uri));
    const name = r.title || m.name || key;
    const link = slugifyLink(m.link || name);
    const slug = slugifySeo(m.slug || link || name || key);
    const photo = m.photo || (link ? `${link}.png` : null);
    const defaultPhotoRel = photo ? `${projectSlug}/photos/${photo}` : null;
    const photoPath = this.toRelativeStoragePath(m.photoPath || m.photoUrl, defaultPhotoRel);
    const photoUrl = this.resolvePublicUrl(photoPath);
    const thumbFile = photo ? `${photo.replace(/\.[^.]+$/, '')}.jpg` : null;
    const defaultThumbRel = thumbFile ? `${projectSlug}/thumbnails/${thumbFile}` : photoPath;
    const thumbnailPath = this.toRelativeStoragePath(m.thumbnailPath || m.thumbnailUrl, defaultThumbRel);
    const thumbnailUrl = this.resolvePublicUrl(thumbnailPath) || photoUrl;
    const authorKey = String(m.authorKey || 'ANON').toUpperCase();
    const author = authorsMap.get(authorKey) || {
      key: authorKey,
      name: authorKey,
      link: authorKey.toLowerCase(),
      paintingCount: 0,
    };
    const categoryKeys: string[] = Array.isArray(m.categoryKeys)
      ? m.categoryKeys.map((c: any) => String(c).toUpperCase())
      : [];
    const categories: GalleryCategoryDTO[] = categoryKeys.map(
      (ck) =>
        categoriesMap.get(ck) || {
          key: ck,
          name: ck,
          nameEn: ck,
          link: ck.toLowerCase(),
          published: true,
          exposed: true,
          paintingCount: 0,
        }
    );

      const categoryNames = categories.map((c) => c.name);
      const createdAtStr =
        r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || '');
      const updatedAtStr =
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt || '');
      const isPublished = Boolean(r.isPublished ?? m.published);
      const description = r.description ?? m.description ?? null;
      const width = m.width ?? null;
      const height = m.height ?? null;
      const canonicalPath = `/painting/${slug}`;
      const seoTitle = `${name} — ${author.name}${categoryNames.length ? ` (${categoryNames.join(', ')})` : ''} | Artmoments`;
      const seoDescription =
        description ||
        `${name} — autor ${author.name}${categoryNames.length ? `, kategooria: ${categoryNames.join(', ')}` : ''}. Akrüülmaal lõuendil.`;
      const seoKeywords = [
        name,
        slug,
        author.name,
        ...categoryNames,
        ...(categories.map((c) => c.nameEn).filter(Boolean) as string[]),
        'akrüülmaal',
        'maal',
        'kunst',
      ];

      const seo: GallerySeoMetaDTO = {
        title: seoTitle,
        description: seoDescription,
        keywords: seoKeywords,
        canonicalPath,
        canonicalUrl: canonicalPath,
        robots: isPublished ? 'index, follow' : 'noindex, nofollow',
        ogType: 'article',
        ogTitle: seoTitle,
        ogDescription: seoDescription,
        ogImage: photoUrl || thumbnailUrl,
        ogImageWidth: width,
        ogImageHeight: height,
        ogImageAlt: `${name} — ${author.name}`,
        locale: 'et_EE',
        lastModified: updatedAtStr || createdAtStr,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'VisualArtwork',
          name,
          identifier: key,
          url: canonicalPath,
          image: photoUrl || thumbnailUrl,
          thumbnailUrl: thumbnailUrl || photoUrl,
          artMedium: 'Acrylic on canvas',
          artworkSurface: 'Canvas',
          creator: {
            '@type': 'Person',
            name: author.name,
          },
          genre: categoryNames,
          ...(width && height
            ? {
                width: { '@type': 'Distance', name: `${width} px` },
                height: { '@type': 'Distance', name: `${height} px` },
              }
            : {}),
          description: seoDescription,
        },
      };

      return {
        id: r.id,
        key,
        uri: r.uri,
        name,
        title: name,
        link,
        slug,
        projectSlug: m.projectSlug || projectSlug,
        photo,
        photoSlug: m.photoSlug || slug,
        photoUrl,
        thumbnailSlug: m.thumbnailSlug || slug,
        thumbnailUrl,
        published: isPublished,
        authorKey,
        authorName: author.name,
        author,
        categoryKeys,
        categories,
        description,
        width,
        height,
        size: m.size ?? null,
        metadata: m,
        createdAt: createdAtStr,
        updatedAt: updatedAtStr,
        seo,
      };
    }

  public async searchItems(
    options: {
      projectId?: string;
      search?: string;
      category?: string;
      categoryKey?: string;
      categoryLink?: string;
      author?: string;
      authorKey?: string;
      authorLink?: string;
      publishedOnly?: boolean;
      page?: number;
      pageSize?: number;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<GalleryPageDTO> {
    const { projectId, scopes } = this.resolveScope(options.projectId);
    const publishedOnly = options.publishedOnly ?? false;
    const prefix = `painting:${projectId}:`;

    const [authors, categories, resources] = await Promise.all([
      this.listAuthors({ projectId }),
      this.listCategories({ projectId, includeUnpublished: !publishedOnly }),
      this.prisma.resource.findMany({
        where: {
          projectId: { in: scopes },
          uri: { startsWith: prefix },
          existent: true,
          deletedAt: null,
          ...(publishedOnly ? { isPublished: true } : {}),
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    const authorsMap = new Map(authors.map((a) => [a.key.toUpperCase(), a]));
    const categoriesMap = new Map(categories.map((c) => [c.key.toUpperCase(), c]));

    // Resolve category filter (by key, link/slug, or name)
    let targetCategoryKey = options.categoryKey ? String(options.categoryKey).toUpperCase() : '';
    const catQuery = (options.categoryLink || options.category || '').trim().toLowerCase();
    if (!targetCategoryKey && catQuery) {
      const foundCat = categories.find(
        (c) =>
          c.link.toLowerCase() === catQuery ||
          c.key.toLowerCase() === catQuery ||
          c.name.toLowerCase() === catQuery ||
          slugifyLink(c.name) === catQuery ||
          (c.nameEn && (c.nameEn.toLowerCase() === catQuery || slugifyLink(c.nameEn) === catQuery))
      );
      targetCategoryKey = foundCat ? foundCat.key.toUpperCase() : catQuery.toUpperCase();
    }
    const activeCategory = targetCategoryKey ? categoriesMap.get(targetCategoryKey) || null : null;

    // Resolve author filter (by key, link/slug, or name)
    let targetAuthorKey = options.authorKey ? String(options.authorKey).toUpperCase() : '';
    const authQuery = (options.authorLink || options.author || '').trim().toLowerCase();
    if (!targetAuthorKey && authQuery) {
      const foundAuth = authors.find(
        (a) =>
          a.link.toLowerCase() === authQuery ||
          a.key.toLowerCase() === authQuery ||
          a.name.toLowerCase() === authQuery ||
          slugifyLink(a.name) === authQuery
      );
      targetAuthorKey = foundAuth ? foundAuth.key.toUpperCase() : authQuery.toUpperCase();
    }
    const activeAuthor = targetAuthorKey ? authorsMap.get(targetAuthorKey) || null : null;

    const q = String(options.search || '').trim().toLowerCase();

    let allDtos: GalleryItemDTO[] = resources.map((r: any) =>
      this.mapResourceToItemDTO(r, authorsMap, categoriesMap, projectId)
    );

    if (targetCategoryKey) {
      allDtos = allDtos.filter((item) => item.categoryKeys.includes(targetCategoryKey));
    }
    if (targetAuthorKey) {
      allDtos = allDtos.filter((item) => item.authorKey === targetAuthorKey);
    }
    if (q) {
      allDtos = allDtos.filter((item) => {
        const hay = `${item.name} ${item.slug} ${item.link} ${item.key} ${item.authorName} ${item.authorKey} ${item.categories.map((c) => `${c.name} ${c.nameEn || ''} ${c.link}`).join(' ')} ${item.description || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // Sort numerically/alphabetically by name like Artmoments catalog
    allDtos.sort((a, b) => a.name.localeCompare(b.name, 'et', { numeric: true }));

    const total = allDtos.length;
    const pageSize = Math.min(
      Math.max(Number(options.pageSize || options.limit) || 200, 1),
      1000
    );
    const offset =
      options.page !== undefined && Number(options.page) >= 1
        ? (Math.max(Number(options.page), 1) - 1) * pageSize
        : Math.max(Number(options.offset) || 0, 0);
    const page = Math.floor(offset / pageSize) + 1;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const paged = allDtos.slice(offset, offset + pageSize);

    const pageTitleParts = [
      activeCategory ? activeCategory.name : null,
      activeAuthor ? activeAuthor.name : null,
      q ? `Otsing: "${options.search}"` : null,
      page > 1 ? `Lehekülg ${page}` : null,
      'Artmoments',
    ].filter(Boolean);
    const pageTitle =
      pageTitleParts.length > 1
        ? pageTitleParts.join(' — ')
        : 'ARTMOMENTS — Akrüülmaalid lõuendil | Kunstigalerii';
    const pageDescription = activeCategory
      ? activeCategory.seo?.description || `Kategooria ${activeCategory.name} (${total} maali).`
      : activeAuthor
        ? activeAuthor.seo?.description || `Autori ${activeAuthor.name} maalid (${total} teost).`
        : `Artmoments kunstigalerii — ${total} avaldatud akrüülmaali lõuendil.`;
    const pageCanonicalPath = activeCategory
      ? `/category/${activeCategory.link}`
      : activeAuthor
        ? `/author/${activeAuthor.link}`
        : '/';
    const firstImg = paged[0]?.photoUrl || paged[0]?.thumbnailUrl || null;
    const latestUpdate =
      paged.reduce((acc, it) => (it.updatedAt > acc ? it.updatedAt : acc), '') ||
      new Date().toISOString();

    const pageSeo: GallerySeoMetaDTO = {
      title: pageTitle,
      description: pageDescription,
      keywords: [
        ...(activeCategory ? [activeCategory.name, activeCategory.link] : []),
        ...(activeAuthor ? [activeAuthor.name, activeAuthor.link] : []),
        'akrüülmaalid',
        'kunstigalerii',
        'Artmoments',
      ],
      canonicalPath: pageCanonicalPath,
      canonicalUrl: pageCanonicalPath,
      robots: 'index, follow',
      ogType: 'website',
      ogTitle: pageTitle,
      ogDescription: pageDescription,
      ogImage: firstImg,
      ogImageWidth: paged[0]?.width ?? null,
      ogImageHeight: paged[0]?.height ?? null,
      ogImageAlt: pageTitle,
      locale: 'et_EE',
      lastModified: latestUpdate,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: pageTitle,
        description: pageDescription,
        url: pageCanonicalPath,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: total,
          itemListElement: paged.map((it, idx) => ({
            '@type': 'ListItem',
            position: offset + idx + 1,
            url: `/painting/${it.slug}`,
            name: it.name,
            image: it.photoUrl || it.thumbnailUrl,
          })),
        },
      },
    };

    return {
      items: paged,
      total,
      page,
      pageSize,
      totalPages,
      offset,
      limit: pageSize,
      hasNextPage: offset + paged.length < total,
      hasPreviousPage: offset > 0,
      activeCategory,
      activeAuthor,
      categories,
      authors,
      seo: pageSeo,
    };
  }

  /**
   * Public-facing paginated photo query (strictly enforces `publishedOnly: true`).
   */
  public async getPublicPhotosPage(
    options: {
      projectId?: string;
      search?: string;
      category?: string;
      categoryKey?: string;
      categoryLink?: string;
      author?: string;
      authorKey?: string;
      authorLink?: string;
      page?: number;
      pageSize?: number;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<GalleryPageDTO> {
    return this.searchItems({
      ...options,
      pageSize: options.pageSize ?? options.limit ?? 24,
      publishedOnly: true,
    });
  }

  /**
   * Public-facing photo detail & stepping query: resolves the requested photo
   * (`slug`, `link`, `key`, or `id`) along with `previousItem`, `nextItem`,
   * `firstItem`, `lastItem`, `position`, `totalInSequence`, and `surroundingItems`
   * within the active category / author / search sequence.
   */
  public async stepPublicPhoto(options: {
    projectId?: string;
    slug?: string;
    link?: string;
    key?: string;
    keyOrLink?: string;
    search?: string;
    category?: string;
    categoryKey?: string;
    categoryLink?: string;
    author?: string;
    authorKey?: string;
    authorLink?: string;
    publishedOnly?: boolean;
    wrapAround?: boolean;
    windowSize?: number;
  }): Promise<GalleryPhotoStepDTO | null> {
    const target = String(
      options.slug || options.link || options.key || options.keyOrLink || ''
    ).trim();
    if (!target) return null;

    const publishedOnly = options.publishedOnly ?? true;
    const sequencePage = await this.searchItems({
      projectId: options.projectId,
      search: options.search,
      category: options.category,
      categoryKey: options.categoryKey,
      categoryLink: options.categoryLink,
      author: options.author,
      authorKey: options.authorKey,
      authorLink: options.authorLink,
      publishedOnly,
      limit: 1000,
      offset: 0,
    });

    let sequence = sequencePage.items;
    const lower = target.toLowerCase();
    const matchFn = (it: GalleryItemDTO) =>
      it.slug.toLowerCase() === lower ||
      it.link.toLowerCase() === lower ||
      it.key.toLowerCase() === lower ||
      it.name.toLowerCase() === lower ||
      String(it.id) === target;

    let idx = sequence.findIndex(matchFn);

    // If the item wasn't in the filtered subset (e.g. direct link), fall back to full public sequence
    if (idx === -1 && (options.category || options.categoryKey || options.categoryLink || options.author || options.authorKey || options.authorLink || options.search)) {
      const fullPage = await this.searchItems({
        projectId: options.projectId,
        publishedOnly,
        limit: 1000,
        offset: 0,
      });
      sequence = fullPage.items;
      idx = sequence.findIndex(matchFn);
    }

    if (idx === -1) return null;

    const item = sequence[idx];
    const totalInSequence = sequence.length;
    const wrap = options.wrapAround ?? false;

    const hasPrevious = idx > 0 || (wrap && totalInSequence > 1);
    const hasNext = idx < totalInSequence - 1 || (wrap && totalInSequence > 1);

    const previousItem =
      idx > 0
        ? sequence[idx - 1]
        : wrap && totalInSequence > 1
          ? sequence[totalInSequence - 1]
          : null;
    const nextItem =
      idx < totalInSequence - 1
        ? sequence[idx + 1]
        : wrap && totalInSequence > 1
          ? sequence[0]
          : null;

    const firstItem = totalInSequence > 0 ? sequence[0] : null;
    const lastItem = totalInSequence > 0 ? sequence[totalInSequence - 1] : null;

    const radius = Math.max(Number(options.windowSize) || 3, 1);
    const startIdx = Math.max(0, idx - radius);
    const endIdx = Math.min(totalInSequence, idx + radius + 1);
    const surroundingItems = sequence.slice(startIdx, endIdx);

    const activeCat = sequencePage.activeCategory || item.categories[0] || null;
    const stepSeo: GallerySeoMetaDTO = item.seo
      ? {
          ...item.seo,
          jsonLd: {
            '@context': 'https://schema.org',
            '@graph': [
              item.seo.jsonLd,
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  {
                    '@type': 'ListItem',
                    position: 1,
                    name: 'Galerii',
                    item: '/',
                  },
                  ...(activeCat
                    ? [
                        {
                          '@type': 'ListItem',
                          position: 2,
                          name: activeCat.name,
                          item: `/category/${activeCat.link}`,
                        },
                      ]
                    : []),
                  {
                    '@type': 'ListItem',
                    position: activeCat ? 3 : 2,
                    name: item.name,
                    item: `/painting/${item.slug}`,
                  },
                ],
              },
            ],
          },
        }
      : {
          title: `${item.name} — ${item.authorName} | Artmoments`,
          description: item.description || `${item.name} (${item.authorName})`,
          keywords: [item.name, item.slug, item.authorName],
          canonicalPath: `/painting/${item.slug}`,
          canonicalUrl: `/painting/${item.slug}`,
          robots: item.published ? 'index, follow' : 'noindex, nofollow',
          ogType: 'article',
          ogTitle: item.name,
          ogDescription: item.description || item.name,
          ogImage: item.photoUrl || item.thumbnailUrl,
          ogImageWidth: item.width ?? null,
          ogImageHeight: item.height ?? null,
          ogImageAlt: item.name,
          locale: 'et_EE',
          lastModified: item.updatedAt,
          jsonLd: {},
        };

    return {
      item,
      position: idx + 1,
      totalInSequence,
      hasPrevious,
      hasNext,
      previousItem,
      nextItem,
      firstItem,
      lastItem,
      surroundingItems,
      activeCategory: sequencePage.activeCategory,
      activeAuthor: sequencePage.activeAuthor,
      seo: stepSeo,
    };
  }

  public async getItem(options: {
    projectId?: string;
    keyOrLink: string;
    publishedOnly?: boolean;
  }): Promise<GalleryItemDTO | null> {
    const { projectId } = this.resolveScope(options.projectId);
    const target = String(options.keyOrLink || '').trim();
    if (!target) return null;

    const { items } = await this.searchItems({
      projectId,
      publishedOnly: options.publishedOnly ?? false,
      limit: 1000,
    });

    const lower = target.toLowerCase();
    return (
      items.find(
        (it) =>
          it.slug.toLowerCase() === lower ||
          it.key.toLowerCase() === lower ||
          it.link.toLowerCase() === lower ||
          it.name.toLowerCase() === lower ||
          String(it.id) === target
      ) || null
    );
  }

  public async deleteItem(options: { projectId?: string; key: string }): Promise<{ deleted: boolean; key: string }> {
    const { projectId } = this.resolveScope(options.projectId);
    const uri = `painting:${projectId}:${options.key}`;
    const res = await this.prisma.resource.updateMany({
      where: { uri },
      data: {
        existent: false,
        deletedAt: new Date(),
      },
    });
    return { deleted: res.count > 0, key: options.key };
  }

  public async bulkUpdateItems(options: {
    projectId?: string;
    keys: string[];
    action: 'publish' | 'unpublish' | 'delete' | 'categorize';
    categoryKey?: string;
  }): Promise<{ updated: number; action: string }> {
    const { projectId } = this.resolveScope(options.projectId);
    const uris = (options.keys || []).map((k) => `painting:${projectId}:${k}`);
    if (uris.length === 0) return { updated: 0, action: options.action };

    if (options.action === 'delete') {
      const res = await this.prisma.resource.updateMany({
        where: { uri: { in: uris } },
        data: { existent: false, deletedAt: new Date() },
      });
      return { updated: res.count, action: options.action };
    }

    if (options.action === 'publish' || options.action === 'unpublish') {
      const isPublished = options.action === 'publish';
      const rows = await this.prisma.resource.findMany({ where: { uri: { in: uris } } });
      let count = 0;
      for (const r of rows) {
        const m = parseMeta(r.metadata);
        m.published = isPublished;
        await this.prisma.resource.update({
          where: { id: r.id },
          data: { isPublished, metadata: m },
        });
        count++;
      }
      return { updated: count, action: options.action };
    }

    if (options.action === 'categorize' && options.categoryKey) {
      const cat = options.categoryKey.toUpperCase();
      const rows = await this.prisma.resource.findMany({ where: { uri: { in: uris } } });
      let count = 0;
      for (const r of rows) {
        const m = parseMeta(r.metadata);
        const list: string[] = Array.isArray(m.categoryKeys) ? m.categoryKeys : [];
        if (!list.includes(cat)) list.push(cat);
        m.categoryKeys = list;
        await this.prisma.resource.update({
          where: { id: r.id },
          data: { metadata: m },
        });
        count++;
      }
      return { updated: count, action: options.action };
    }

    return { updated: 0, action: options.action };
  }

  // ---------------------------------------------------------------------------
  // Gallery Info, Contact & Markdown Texts (Curator Resource + Text)
  // ---------------------------------------------------------------------------
  public async upsertGalleryInfo(input: {
    projectId?: string;
    title?: string;
    subtitle?: string;
    aboutMarkdown?: string;
    orderingMarkdown?: string;
    phone?: string;
    email?: string;
    logoLightUrl?: string;
    logoDarkUrl?: string;
    structuredData?: Record<string, any>;
  }): Promise<GalleryInfoDTO> {
    const { userId, projectId, projectSlug } = await this.ensureProject(input.projectId);
    const uri = `gallery:info:${projectId}`;

    const existing = await this.prisma.resource.findUnique({
      where: { uri },
      include: { texts: true },
    });
    const prevMeta = parseMeta(existing?.metadata);

    const title = input.title ?? existing?.title ?? 'ARTMOMENTS';
    const subtitle = input.subtitle ?? prevMeta.subtitle ?? 'akrüülmaalid lõuendil';
    const phone = input.phone ?? prevMeta.phone ?? '+372 58194961';
    const email = (input.email ?? prevMeta.email ?? 'mailbox@artmoments.ee').trim();
    const logoLightPath =
      this.toRelativeStoragePath(
        input.logoLightUrl ?? prevMeta.logoLightPath ?? prevMeta.logoLightUrl,
        `${projectSlug}/assets/lillelogo1.svg`
      ) || `${projectSlug}/assets/lillelogo1.svg`;
    const logoDarkPath =
      this.toRelativeStoragePath(
        input.logoDarkUrl ?? prevMeta.logoDarkPath ?? prevMeta.logoDarkUrl,
        `${projectSlug}/assets/lillelogo4.svg`
      ) || `${projectSlug}/assets/lillelogo4.svg`;
    const structuredData = input.structuredData ?? prevMeta.structuredData ?? {
      '@context': 'https://schema.org',
      '@type': 'ArtGallery',
      name: 'Artmoments',
      description: 'OÜ Artmoments - akrüülmaalid lõuendil. Dekoratiivmaalide valmistamine ja müük.',
      artist: { '@type': 'Person', name: 'Kadi Kiho' },
      artMedium: 'Acrylic on canvas',
    };

    const infoRes = await this.prisma.resource.upsert({
      where: { uri },
      update: {
        title,
        description: subtitle,
        isPublished: true,
        projectId,
        existent: true,
        metadata: {
          entityType: 'gallery_info',
          subtitle,
          phone,
          email,
          logoLightPath,
          logoDarkPath,
          logoLightUrl: logoLightPath,
          logoDarkUrl: logoDarkPath,
          structuredData,
        },
      },
      create: {
        uri,
        title,
        description: subtitle,
        isPublished: true,
        userId,
        projectId,
        existent: true,
        metadata: {
          entityType: 'gallery_info',
          subtitle,
          phone,
          email,
          logoLightPath,
          logoDarkPath,
          logoLightUrl: logoLightPath,
          logoDarkUrl: logoDarkPath,
          structuredData,
        },
      },
    });

    if (input.aboutMarkdown !== undefined) {
      await this.prisma.text.upsert({
        where: {
          resourceId_role: {
            resourceId: infoRes.id,
            role: 'ABOUT',
          },
        },
        update: {
          content: input.aboutMarkdown,
          mimeType: 'text/markdown',
          extension: 'md',
          isPublished: true,
          existent: true,
        },
        create: {
          resourceId: infoRes.id,
          role: 'ABOUT',
          content: input.aboutMarkdown,
          mimeType: 'text/markdown',
          extension: 'md',
          isPublished: true,
          existent: true,
          userId,
        },
      });
    }

    if (input.orderingMarkdown !== undefined) {
      await this.prisma.text.upsert({
        where: {
          resourceId_role: {
            resourceId: infoRes.id,
            role: 'ORDERING',
          },
        },
        update: {
          content: input.orderingMarkdown,
          mimeType: 'text/markdown',
          extension: 'md',
          isPublished: true,
          existent: true,
        },
        create: {
          resourceId: infoRes.id,
          role: 'ORDERING',
          content: input.orderingMarkdown,
          mimeType: 'text/markdown',
          extension: 'md',
          isPublished: true,
          existent: true,
          userId,
        },
      });
    }

    return this.getGalleryInfo({ projectId });
  }

  public async getGalleryInfo(options: { projectId?: string } = {}): Promise<GalleryInfoDTO> {
    const { projectId, projectSlug } = this.resolveScope(options.projectId);
    const uri = `gallery:info:${projectId}`;

    const infoRes = await this.prisma.resource.findUnique({
      where: { uri },
      include: { texts: { where: { existent: true } } },
    });

    const m = parseMeta(infoRes?.metadata);
    const texts: any[] = infoRes?.texts || [];
    const aboutText = texts.find((t) => t.role === 'ABOUT')?.content || '';
    const orderingText = texts.find((t) => t.role === 'ORDERING')?.content || '';

    const title = infoRes?.title || 'ARTMOMENTS';
    const subtitle = m.subtitle || 'akrüülmaalid lõuendil';
    const logoLightUrl =
      this.resolvePublicUrl(m.logoLightPath || m.logoLightUrl, `${projectSlug}/assets/lillelogo1.svg`) ||
      `${this.publicUrlPrefix}/${projectSlug}/assets/lillelogo1.svg`;
    const logoDarkUrl =
      this.resolvePublicUrl(m.logoDarkPath || m.logoDarkUrl, `${projectSlug}/assets/lillelogo4.svg`) ||
      `${this.publicUrlPrefix}/${projectSlug}/assets/lillelogo4.svg`;
    const structuredData = m.structuredData || {
      '@context': 'https://schema.org',
      '@type': 'ArtGallery',
      name: title,
      description: `${title} — ${subtitle}`,
    };
    const lastModified =
      infoRes?.updatedAt instanceof Date
        ? infoRes.updatedAt.toISOString()
        : new Date().toISOString();

    return {
      projectId,
      projectSlug,
      title,
      subtitle,
      aboutMarkdown: aboutText,
      orderingMarkdown: orderingText,
      phone: m.phone || '+372 58194961',
      email: m.email || 'mailbox@artmoments.ee',
      logoLightUrl,
      logoDarkUrl,
      structuredData,
      seo: {
        title: `${title} — ${subtitle}`,
        description:
          aboutText.slice(0, 180).replace(/\s+/g, ' ').trim() ||
          `${title} — ${subtitle}. Dekoratiivmaalide valmistamine ja müük.`,
        keywords: [title, subtitle, 'akrüülmaalid', 'maalid lõuendil', 'kunstigalerii'],
        canonicalPath: '/',
        canonicalUrl: '/',
        robots: 'index, follow',
        ogType: 'website',
        ogTitle: `${title} — ${subtitle}`,
        ogDescription: `${title} — ${subtitle}`,
        ogImage: logoLightUrl,
        ogImageWidth: null,
        ogImageHeight: null,
        ogImageAlt: title,
        locale: 'et_EE',
        lastModified,
        jsonLd: structuredData,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // SEO Index, Route Manifest, XML Sitemap (with Image Extensions) & LLMs.txt
  // ---------------------------------------------------------------------------
  public async getSeoIndex(
    options: { projectId?: string; baseUrl?: string } = {}
  ): Promise<GallerySeoIndexDTO> {
    const { projectId, projectSlug } = this.resolveScope(options.projectId);
    const rawBase = String(
      options.baseUrl || process.env.PUBLIC_SITE_URL || process.env.GALLERY_PUBLIC_BASE_URL || ''
    )
      .trim()
      .replace(/\/+$/, '');

    const toAbsUrl = (relOrPath: string | null | undefined): string => {
      if (!relOrPath) return '';
      if (/^https?:\/\//i.test(relOrPath)) return relOrPath;
      const p = relOrPath.startsWith('/') ? relOrPath : `/${relOrPath}`;
      return rawBase ? `${rawBase}${p}` : p;
    };

    const [siteInfo, pageData] = await Promise.all([
      this.getGalleryInfo({ projectId }),
      this.searchItems({ projectId, publishedOnly: true, limit: 1000, offset: 0 }),
    ]);

    const categories = pageData.categories
      .filter((c) => c.published || c.exposed)
      .map((c) => ({
        ...c,
        seo: c.seo
          ? {
              ...c.seo,
              canonicalUrl: toAbsUrl(c.seo.canonicalPath),
            }
          : undefined,
      }));

    const authors = pageData.authors.map((a) => ({
      ...a,
      seo: a.seo
        ? {
            ...a.seo,
            canonicalUrl: toAbsUrl(a.seo.canonicalPath),
          }
        : undefined,
    }));

    const publishedItems = pageData.items;

    let latestTimestamp = siteInfo.seo?.lastModified || '';
    for (const it of publishedItems) {
      if (it.updatedAt && it.updatedAt > latestTimestamp) {
        latestTimestamp = it.updatedAt;
      }
    }
    if (!latestTimestamp) latestTimestamp = new Date().toISOString();

    const routes: GallerySeoRouteDTO[] = [];

    // 1. Home Route
    routes.push({
      path: '/',
      canonicalUrl: toAbsUrl('/'),
      type: 'home',
      slug: '',
      title: siteInfo.seo?.title || `${siteInfo.title} — ${siteInfo.subtitle}`,
      description: siteInfo.seo?.description || siteInfo.subtitle,
      keywords: siteInfo.seo?.keywords || [siteInfo.title],
      lastModified: latestTimestamp,
      changeFreq: 'weekly',
      priority: 1.0,
      image: siteInfo.logoLightUrl
        ? {
            loc: toAbsUrl(siteInfo.logoLightUrl),
            title: siteInfo.title,
            caption: siteInfo.subtitle,
          }
        : null,
    });

    // 2. Category Routes
    for (const cat of categories) {
      const catPath = `/category/${cat.link}`;
      const samplePhoto = publishedItems.find((it) => it.categoryKeys.includes(cat.key));
      routes.push({
        path: catPath,
        canonicalUrl: toAbsUrl(catPath),
        type: 'category',
        slug: cat.link,
        title: cat.seo?.title || `${cat.name} | ${siteInfo.title}`,
        description: cat.seo?.description || `${cat.name} (${cat.paintingCount})`,
        keywords: cat.seo?.keywords || [cat.name, cat.link],
        lastModified: cat.seo?.lastModified || latestTimestamp,
        changeFreq: 'weekly',
        priority: 0.8,
        image:
          samplePhoto && (samplePhoto.photoUrl || samplePhoto.thumbnailUrl)
            ? {
                loc: toAbsUrl(samplePhoto.photoUrl || samplePhoto.thumbnailUrl),
                thumbnailLoc: toAbsUrl(samplePhoto.thumbnailUrl || samplePhoto.photoUrl),
                title: `${cat.name} — ${samplePhoto.name}`,
                caption: cat.seo?.description || cat.name,
              }
            : null,
      });
    }

    // 3. Author Routes
    for (const auth of authors) {
      const authPath = `/author/${auth.link}`;
      const samplePhoto = publishedItems.find((it) => it.authorKey === auth.key);
      routes.push({
        path: authPath,
        canonicalUrl: toAbsUrl(authPath),
        type: 'author',
        slug: auth.link,
        title: auth.seo?.title || `${auth.name} | ${siteInfo.title}`,
        description: auth.seo?.description || `${auth.name} (${auth.paintingCount})`,
        keywords: auth.seo?.keywords || [auth.name, auth.link],
        lastModified: auth.seo?.lastModified || latestTimestamp,
        changeFreq: 'monthly',
        priority: 0.7,
        image:
          samplePhoto && (samplePhoto.photoUrl || samplePhoto.thumbnailUrl)
            ? {
                loc: toAbsUrl(samplePhoto.photoUrl || samplePhoto.thumbnailUrl),
                thumbnailLoc: toAbsUrl(samplePhoto.thumbnailUrl || samplePhoto.photoUrl),
                title: `${auth.name} — ${samplePhoto.name}`,
                caption: auth.bio || auth.name,
              }
            : null,
      });
    }

    // 4. Individual Photo Routes + Compact Index Entries
    const itemsIndex: GallerySeoItemEntryDTO[] = [];
    for (const item of publishedItems) {
      const itemPath = `/painting/${item.slug}`;
      const canonicalUrl = toAbsUrl(itemPath);
      const absPhotoUrl = item.photoUrl ? toAbsUrl(item.photoUrl) : null;
      const absThumbUrl = item.thumbnailUrl ? toAbsUrl(item.thumbnailUrl) : null;

      routes.push({
        path: itemPath,
        canonicalUrl,
        type: 'photo',
        slug: item.slug,
        title: item.seo?.title || `${item.name} — ${item.authorName}`,
        description: item.seo?.description || `${item.name} (${item.authorName})`,
        keywords: item.seo?.keywords || [item.name, item.slug, item.authorName],
        lastModified: item.updatedAt || item.createdAt || latestTimestamp,
        changeFreq: 'monthly',
        priority: 0.6,
        image:
          absPhotoUrl || absThumbUrl
            ? {
                loc: (absPhotoUrl || absThumbUrl)!,
                thumbnailLoc: absThumbUrl || absPhotoUrl,
                title: `${item.name} — ${item.authorName}`,
                caption: item.seo?.description || item.name,
                width: item.width ?? null,
                height: item.height ?? null,
              }
            : null,
      });

      itemsIndex.push({
        key: item.key,
        slug: item.slug,
        photoSlug: item.photoSlug || item.slug,
        title: item.name,
        path: itemPath,
        canonicalUrl,
        authorKey: item.authorKey,
        authorSlug: item.author?.link || slugifyLink(item.authorName || item.authorKey),
        authorName: item.authorName,
        categoryKeys: item.categoryKeys,
        categorySlugs: item.categories.map((c) => c.link),
        categoryNames: item.categories.map((c) => c.name),
        photoUrl: absPhotoUrl,
        thumbnailUrl: absThumbUrl,
        width: item.width ?? null,
        height: item.height ?? null,
        updatedAt: item.updatedAt || item.createdAt || latestTimestamp,
      });
    }

    const etagHash = crypto
      .createHash('sha1')
      .update(`${projectId}:${publishedItems.length}:${categories.length}:${authors.length}:${latestTimestamp}`)
      .digest('hex')
      .slice(0, 16);

    return {
      projectId,
      projectSlug,
      canonicalBaseUrl: rawBase || '/',
      generatedAt: new Date().toISOString(),
      lastModified: latestTimestamp,
      etag: `"gallery-seo-${projectSlug}-${etagHash}"`,
      totalRoutes: routes.length,
      totalPhotos: itemsIndex.length,
      totalCategories: categories.length,
      totalAuthors: authors.length,
      site: {
        ...siteInfo,
        seo: siteInfo.seo
          ? {
              ...siteInfo.seo,
              canonicalUrl: toAbsUrl('/'),
            }
          : undefined,
      },
      routes,
      categories,
      authors,
      items: itemsIndex,
      sitemapXmlUrl: toAbsUrl('/sitemap.xml'),
      llmsTxtUrl: toAbsUrl('/llms.txt'),
    };
  }

  public async generateSitemapXml(
    options: { projectId?: string; baseUrl?: string } = {}
  ): Promise<string> {
    const index = await this.getSeoIndex(options);
    const escXml = (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const urlNodes = index.routes.map((r) => {
      const imgBlock = r.image?.loc
        ? [
            '    <image:image>',
            `      <image:loc>${escXml(r.image.loc)}</image:loc>`,
            `      <image:title>${escXml(r.image.title)}</image:title>`,
            r.image.caption ? `      <image:caption>${escXml(r.image.caption)}</image:caption>` : '',
            '    </image:image>',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

      return [
        '  <url>',
        `    <loc>${escXml(r.canonicalUrl)}</loc>`,
        r.lastModified ? `    <lastmod>${escXml(r.lastModified)}</lastmod>` : '',
        `    <changefreq>${r.changeFreq}</changefreq>`,
        `    <priority>${r.priority.toFixed(1)}</priority>`,
        imgBlock,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    });

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      ...urlNodes,
      '</urlset>',
    ].join('\n');
  }

  public generateRobotsTxt(options: { baseUrl?: string } = {}): string {
    const rawBase = String(
      options.baseUrl || process.env.PUBLIC_SITE_URL || process.env.GALLERY_PUBLIC_BASE_URL || ''
    )
      .trim()
      .replace(/\/+$/, '');
    const sitemapUrl = rawBase ? `${rawBase}/sitemap.xml` : '/sitemap.xml';
    return [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /auth/',
      `Sitemap: ${sitemapUrl}`,
      '',
    ].join('\n');
  }

  public async generateLlmsTxt(
    options: { projectId?: string; baseUrl?: string } = {}
  ): Promise<string> {
    const index = await this.getSeoIndex(options);
    const lines: string[] = [
      `# ${index.site.title} — ${index.site.subtitle}`,
      '',
      `> Project: ${index.projectSlug} | Published Artworks: ${index.totalPhotos} | Categories: ${index.totalCategories} | Authors: ${index.totalAuthors}`,
      '',
      '## Contact',
      `- Email: ${index.site.email}`,
      `- Phone: ${index.site.phone}`,
      '',
    ];

    if (index.site.aboutMarkdown) {
      lines.push('## About', index.site.aboutMarkdown.trim(), '');
    }

    lines.push('## Categories');
    for (const c of index.categories) {
      lines.push(
        `- [${c.name}${c.nameEn ? ` / ${c.nameEn}` : ''}](${c.seo?.canonicalUrl || `/category/${c.link}`}): ${c.paintingCount} artworks`
      );
    }
    lines.push('');

    lines.push('## Authors');
    for (const a of index.authors) {
      lines.push(
        `- [${a.name}](${a.seo?.canonicalUrl || `/author/${a.link}`}): ${a.paintingCount} artworks${a.bio ? ` — ${a.bio}` : ''}`
      );
    }
    lines.push('');

    return lines.join('\n');
  }

  public async getStats(options: { projectId?: string } = {}): Promise<GalleryStatsDTO> {
    const { projectId, scopes } = this.resolveScope(options.projectId);
    const [totalItems, publishedItems, totalCategories, publishedCategories, totalAuthors, totalAttachments] =
      await Promise.all([
        this.prisma.resource.count({
          where: { projectId: { in: scopes }, uri: { startsWith: `painting:${projectId}:` }, existent: true, deletedAt: null },
        }),
        this.prisma.resource.count({
          where: {
            projectId: { in: scopes },
            uri: { startsWith: `painting:${projectId}:` },
            existent: true,
            deletedAt: null,
            isPublished: true,
          },
        }),
        this.prisma.resource.count({
          where: { projectId: { in: scopes }, uri: { startsWith: `category:${projectId}:` }, existent: true, deletedAt: null },
        }),
        this.prisma.resource.count({
          where: {
            projectId: { in: scopes },
            uri: { startsWith: `category:${projectId}:` },
            existent: true,
            deletedAt: null,
            isPublished: true,
          },
        }),
        this.prisma.resource.count({
          where: { projectId: { in: scopes }, uri: { startsWith: `author:${projectId}:` }, existent: true, deletedAt: null },
        }),
        this.prisma.attachment.count({
          where: {
            OR: [{ projectId }, { uri: { startsWith: `attachment:${projectId}:` } }],
            existent: true,
          },
        }),
      ]);

    return {
      projectId,
      totalItems,
      publishedItems,
      draftItems: Math.max(0, totalItems - publishedItems),
      totalCategories,
      publishedCategories,
      totalAuthors,
      totalAttachments,
    };
  }
}

