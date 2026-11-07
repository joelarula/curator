import {
  GalleryConstant,
  type GalleryAuthorDTO,
  type GalleryCategoryDTO,
  type GalleryItemDTO,
  type GalleryInfoDTO,
  type GalleryStatsDTO,
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
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
}

/**
 * Repository operating directly on Curator Core Database models:
 * Project, Resource, Attachment, Relation, ResourceTree, Text.
 * All queries are scoped to [projectId, 'system'].
 */
export class GalleryRepository {
  private prismaGetter: () => any;
  public readonly defaultProjectId: string;

  constructor(prismaOrGetter: any, defaultProjectId: string = GalleryConstant.DEFAULT_PROJECT_ID) {
    this.prismaGetter = typeof prismaOrGetter === 'function' ? prismaOrGetter : () => prismaOrGetter;
    this.defaultProjectId = defaultProjectId;
  }

  public get prisma(): any {
    const db = this.prismaGetter();
    if (!db) throw new Error('Curator Prisma client is not initialized yet.');
    return db;
  }

  public resolveScope(projectId?: string): { projectId: string; scopes: string[] } {
    const active = (projectId || this.defaultProjectId).trim() || GalleryConstant.DEFAULT_PROJECT_ID;
    const scopes = active === 'system' ? ['system'] : [active, 'system'];
    return { projectId: active, scopes };
  }

  public async ensureProject(projectId?: string, projectName?: string): Promise<{ userId: string; projectId: string }> {
    const { projectId: pid } = this.resolveScope(projectId);
    const db = this.prisma;

    const user = await db.user.upsert({
      where: { email: 'system@local' },
      update: {},
      create: { id: 'system', email: 'system@local', name: 'System User' },
    });

    await db.project.upsert({
      where: { id: 'system' },
      update: { existent: true },
      create: { id: 'system', name: 'System', userId: user.id, existent: true },
    });

    await db.project.upsert({
      where: { id: pid },
      update: { existent: true },
      create: {
        id: pid,
        name: projectName || GalleryConstant.DEFAULT_PROJECT_NAME,
        userId: user.id,
        existent: true,
      },
    });

    return { userId: user.id, projectId: pid };
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
    const link = input.link ? String(input.link).trim() : slugifyLink(key);
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
      return {
        key,
        name: r.title || m.name || key,
        link: m.link || slugifyLink(key),
        bio: r.description || m.bio || null,
        paintingCount: countsByAuthor[key] || 0,
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
      return {
        key,
        name: r.title || m.name || key,
        nameEn: m.nameEn || r.description || null,
        link: m.link || slugifyLink(r.title || key),
        published,
        exposed,
        sortOrder: Number(m.sortOrder || 0),
        paintingCount: countsByCat[key] || 0,
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
    const { userId, projectId } = await this.ensureProject(input.projectId);
    const key = String(input.key).trim();
    const uri = `painting:${projectId}:${key}`;

    // Merge with existing metadata if partial update
    const existing = await this.prisma.resource.findUnique({
      where: { uri },
      include: { attachments: true },
    });
    const prevMeta = parseMeta(existing?.metadata);

    const name = input.name ?? existing?.title ?? key;
    const link = input.link ?? prevMeta.link ?? slugifyLink(name);
    const photo = input.photo !== undefined ? input.photo : (prevMeta.photo ?? (link ? `${link}.png` : null));
    const photoUrl =
      input.photoUrl !== undefined
        ? input.photoUrl
        : prevMeta.photoUrl || (photo ? `/media/${projectId}/photos/${photo}` : null);
    const thumbFile = photo ? `${photo.replace(/\.[^.]+$/, '')}.jpg` : null;
    const thumbnailUrl =
      input.thumbnailUrl !== undefined
        ? input.thumbnailUrl
        : prevMeta.thumbnailUrl || (thumbFile ? `/media/${projectId}/thumbnails/${thumbFile}` : photoUrl);
    const authorKey = String(input.authorKey ?? prevMeta.authorKey ?? 'ANON').toUpperCase();
    const categoryKeys: string[] = Array.isArray(input.categoryKeys)
      ? input.categoryKeys.map((c) => String(c).toUpperCase())
      : Array.isArray(prevMeta.categoryKeys)
        ? prevMeta.categoryKeys
        : [];
    const published = input.published !== undefined ? Boolean(input.published) : Boolean(existing?.isPublished ?? true);
    const description = input.description !== undefined ? input.description : (existing?.description ?? null);

    const nextMeta = {
      ...prevMeta,
      ...(input.metadata || {}),
      entityType: 'painting',
      key,
      name,
      link,
      photo,
      photoUrl,
      thumbnailUrl,
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

    // Upsert Attachment rows for photoUrl & thumbnailUrl
    if (photo && photoUrl) {
      const photoAttUri = `attachment:${projectId}:photos:${photo}`;
      await this.prisma.attachment.upsert({
        where: { uri: photoAttUri },
        update: {
          resourceId: resource.id,
          filename: photo,
          mimetype: photo.endsWith('.png') ? 'image/png' : 'image/jpeg',
          url: photoUrl,
          size: Number(nextMeta.size || 0),
          existent: true,
        },
        create: {
          resourceId: resource.id,
          uri: photoAttUri,
          filename: photo,
          mimetype: photo.endsWith('.png') ? 'image/png' : 'image/jpeg',
          url: photoUrl,
          size: Number(nextMeta.size || 0),
          existent: true,
        },
      });
    }

    if (thumbFile && thumbnailUrl) {
      const thumbAttUri = `attachment:${projectId}:thumbnails:${thumbFile}`;
      await this.prisma.attachment.upsert({
        where: { uri: thumbAttUri },
        update: {
          resourceId: resource.id,
          filename: thumbFile,
          mimetype: 'image/jpeg',
          url: thumbnailUrl,
          size: 0,
          existent: true,
        },
        create: {
          resourceId: resource.id,
          uri: thumbAttUri,
          filename: thumbFile,
          mimetype: 'image/jpeg',
          url: thumbnailUrl,
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
    const prefix = `painting:${projectId}:`;
    const key = String(m.key || (r.uri?.startsWith(prefix) ? r.uri.slice(prefix.length) : r.uri));
    const name = r.title || m.name || key;
    const link = m.link || slugifyLink(name);
    const photo = m.photo || (link ? `${link}.png` : null);
    const photoUrl = m.photoUrl || (photo ? `/media/${projectId}/photos/${photo}` : null);
    const thumbFile = photo ? `${photo.replace(/\.[^.]+$/, '')}.jpg` : null;
    const thumbnailUrl = m.thumbnailUrl || (thumbFile ? `/media/${projectId}/thumbnails/${thumbFile}` : photoUrl);
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

    return {
      id: r.id,
      key,
      uri: r.uri,
      name,
      title: name,
      link,
      photo,
      photoUrl,
      thumbnailUrl,
      published: Boolean(r.isPublished ?? m.published),
      authorKey,
      authorName: author.name,
      author,
      categoryKeys,
      categories,
      description: r.description ?? m.description ?? null,
      width: m.width ?? null,
      height: m.height ?? null,
      size: m.size ?? null,
      metadata: m,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || ''),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt || ''),
    };
  }

  public async searchItems(
    options: {
      projectId?: string;
      search?: string;
      categoryKey?: string;
      categoryLink?: string;
      authorKey?: string;
      authorLink?: string;
      publishedOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    items: GalleryItemDTO[];
    total: number;
    categories: GalleryCategoryDTO[];
    authors: GalleryAuthorDTO[];
  }> {
    const { projectId, scopes } = this.resolveScope(options.projectId);
    const publishedOnly = options.publishedOnly ?? false;
    const prefix = `painting:${projectId}:`;

    const [authors, categories, resources] = await Promise.all([
      this.listAuthors({ projectId }),
      this.listCategories({ projectId, includeUnpublished: true }),
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

    // Resolve categoryLink or authorLink if provided
    let targetCategoryKey = options.categoryKey ? String(options.categoryKey).toUpperCase() : '';
    if (!targetCategoryKey && options.categoryLink) {
      const foundCat = categories.find(
        (c) =>
          c.link.toLowerCase() === options.categoryLink!.toLowerCase() ||
          c.key.toLowerCase() === options.categoryLink!.toLowerCase()
      );
      if (foundCat) targetCategoryKey = foundCat.key.toUpperCase();
    }

    let targetAuthorKey = options.authorKey ? String(options.authorKey).toUpperCase() : '';
    if (!targetAuthorKey && options.authorLink) {
      const foundAuth = authors.find(
        (a) =>
          a.link.toLowerCase() === options.authorLink!.toLowerCase() ||
          a.key.toLowerCase() === options.authorLink!.toLowerCase()
      );
      if (foundAuth) targetAuthorKey = foundAuth.key.toUpperCase();
    }

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
        const hay = `${item.name} ${item.link} ${item.key} ${item.authorName} ${item.authorKey} ${item.categories.map((c) => `${c.name} ${c.nameEn || ''}`).join(' ')} ${item.description || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // Sort numerically/alphabetically by name like Artmoments catalog
    allDtos.sort((a, b) => a.name.localeCompare(b.name, 'et', { numeric: true }));

    const total = allDtos.length;
    const offset = Math.max(Number(options.offset) || 0, 0);
    const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 1000);
    const paged = allDtos.slice(offset, offset + limit);

    return {
      items: paged,
      total,
      categories,
      authors,
    };
  }

  public async getItem(options: {
    projectId?: string;
    keyOrLink: string;
  }): Promise<GalleryItemDTO | null> {
    const { projectId } = this.resolveScope(options.projectId);
    const target = String(options.keyOrLink || '').trim();
    if (!target) return null;

    const { items } = await this.searchItems({
      projectId,
      publishedOnly: false,
      limit: 1000,
    });

    const lower = target.toLowerCase();
    return (
      items.find(
        (it) =>
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
    const { userId, projectId } = await this.ensureProject(input.projectId);
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
    const logoLightUrl = input.logoLightUrl ?? prevMeta.logoLightUrl ?? `/media/${projectId}/assets/lillelogo1.svg`;
    const logoDarkUrl = input.logoDarkUrl ?? prevMeta.logoDarkUrl ?? `/media/${projectId}/assets/lillelogo4.svg`;
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
          logoLightUrl,
          logoDarkUrl,
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
          logoLightUrl,
          logoDarkUrl,
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
    const { projectId } = this.resolveScope(options.projectId);
    const uri = `gallery:info:${projectId}`;

    const infoRes = await this.prisma.resource.findUnique({
      where: { uri },
      include: { texts: { where: { existent: true } } },
    });

    const m = parseMeta(infoRes?.metadata);
    const texts: any[] = infoRes?.texts || [];
    const aboutText = texts.find((t) => t.role === 'ABOUT')?.content || '';
    const orderingText = texts.find((t) => t.role === 'ORDERING')?.content || '';

    return {
      projectId,
      title: infoRes?.title || 'ARTMOMENTS',
      subtitle: m.subtitle || 'akrüülmaalid lõuendil',
      aboutMarkdown: aboutText,
      orderingMarkdown: orderingText,
      phone: m.phone || '+372 58194961',
      email: m.email || 'mailbox@artmoments.ee',
      logoLightUrl: m.logoLightUrl || `/media/${projectId}/assets/lillelogo1.svg`,
      logoDarkUrl: m.logoDarkUrl || `/media/${projectId}/assets/lillelogo4.svg`,
      structuredData: m.structuredData || {
        '@context': 'https://schema.org',
        '@type': 'ArtGallery',
        name: 'Artmoments',
      },
    };
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
          where: { uri: { startsWith: `attachment:${projectId}:` }, existent: true },
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

