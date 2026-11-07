import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { StorageService } from '@curator/plugin-storage';
import type { ImageProcessorService } from '@curator/plugin-image';
import { GalleryRepository, slugifyLink } from './galleryRepository.ts';

export interface Artm2DiscoveryManifest {
  sourceDir: string;
  authorsCount: number;
  categoriesCount: number;
  paintingsCount: number;
  photosCount: number;
  thumbnailsCount: number;
  hasContact: boolean;
  hasAboutMd: boolean;
  hasOrderingMd: boolean;
  paintingFiles: string[];
}

export interface Artm2MigrationSummary {
  projectId: string;
  sourceDir: string;
  authorsMigrated: number;
  categoriesMigrated: number;
  paintingsMigrated: number;
  categoryLinksCreated: number;
  photosCopied: number;
  thumbnailsCopiedOrGenerated: number;
  assetsCopied: number;
  infoMigrated: boolean;
}

export class Artm2Migrator {
  private repo: GalleryRepository;
  private storage: StorageService;
  private imageProcessor: ImageProcessorService;

  constructor(options: {
    repo: GalleryRepository;
    storage: StorageService;
    imageProcessor: ImageProcessorService;
  }) {
    this.repo = options.repo;
    this.storage = options.storage;
    this.imageProcessor = options.imageProcessor;
  }

  public async discover(sourceDir = 'Z:/artm2/gallery/data/db'): Promise<Artm2DiscoveryManifest> {
    const resolved = path.resolve(sourceDir);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Artm2 source directory not found: ${resolved}`);
    }

    const authorsDir = path.join(resolved, 'authors');
    const paintingsDir = path.join(resolved, 'paintings');
    const photosDir = path.join(resolved, 'photos');
    const thumbsDir = path.join(resolved, 'thumbnails');
    const menuFile = path.join(resolved, 'menu.json');

    const authorFiles = fs.existsSync(authorsDir)
      ? (await fsp.readdir(authorsDir)).filter((f) => f.endsWith('.json'))
      : [];
    const paintingFiles = fs.existsSync(paintingsDir)
      ? (await fsp.readdir(paintingsDir)).filter((f) => f.endsWith('.json'))
      : [];
    const photoFiles = fs.existsSync(photosDir) ? await fsp.readdir(photosDir) : [];
    const thumbFiles = fs.existsSync(thumbsDir) ? await fsp.readdir(thumbsDir) : [];

    let categoriesCount = 0;
    if (fs.existsSync(menuFile)) {
      const menu = JSON.parse(await fsp.readFile(menuFile, 'utf-8'));
      categoriesCount = Object.keys(menu).length;
    }

    return {
      sourceDir: resolved,
      authorsCount: authorFiles.length,
      categoriesCount,
      paintingsCount: paintingFiles.length,
      photosCount: photoFiles.length,
      thumbnailsCount: thumbFiles.length,
      hasContact: fs.existsSync(path.join(resolved, 'contact.json')),
      hasAboutMd: fs.existsSync(path.join(resolved, 'artmoments.md')),
      hasOrderingMd: fs.existsSync(path.join(resolved, 'tellimine.md')),
      paintingFiles,
    };
  }

  public async migrateMetadataAndAssets(options: {
    sourceDir?: string;
    projectId?: string;
  } = {}): Promise<{
    authorsMigrated: number;
    categoriesMigrated: number;
    assetsCopied: number;
    infoMigrated: boolean;
  }> {
    const sourceDir = path.resolve(options.sourceDir || 'Z:/artm2/gallery/data/db');
    const { projectId } = await this.repo.ensureProject(options.projectId);

    // 1. Migrate Authors
    let authorsMigrated = 0;
    const authorsDir = path.join(sourceDir, 'authors');
    if (fs.existsSync(authorsDir)) {
      const files = (await fsp.readdir(authorsDir)).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const raw = JSON.parse(await fsp.readFile(path.join(authorsDir, file), 'utf-8'));
        await this.repo.upsertAuthor({
          projectId,
          key: raw.key,
          name: raw.name,
          link: raw.link,
        });
        authorsMigrated++;
      }
    }

    // 2. Migrate Categories
    let categoriesMigrated = 0;
    const menuFile = path.join(sourceDir, 'menu.json');
    if (fs.existsSync(menuFile)) {
      const menu = JSON.parse(await fsp.readFile(menuFile, 'utf-8'));
      let sortOrder = 1;
      for (const [, cat] of Object.entries<any>(menu)) {
        const published = Boolean(cat.published ?? cat.public ?? false);
        const exposed = Boolean(cat.exposed ?? published);
        await this.repo.upsertCategory({
          projectId,
          key: cat.key,
          name: cat.name,
          nameEn: cat.name_en || null,
          link: cat.link,
          published,
          exposed,
          sortOrder: sortOrder++,
        });
        categoriesMigrated++;
      }
    }

    // 3. Copy SVG / Branding Assets to VM storage
    let assetsCopied = 0;
    const candidateAssetDirs = [
      path.join(sourceDir, 'assets'),
      path.resolve(sourceDir, '../../assets'),
    ];
    for (const assetDir of candidateAssetDirs) {
      if (!fs.existsSync(assetDir)) continue;
      const assetFiles = (await fsp.readdir(assetDir)).filter((f) =>
        ['.svg', '.png', '.jpg', '.webp'].includes(path.extname(f).toLowerCase())
      );
      for (const assetName of assetFiles) {
        try {
          await this.storage.copyLocalFile({
            sourcePath: path.join(assetDir, assetName),
            projectId,
            bucket: 'assets',
            filename: assetName,
          });
          assetsCopied++;
        } catch {}
      }
    }

    // 4. Migrate Contact & Markdown Texts (artmoments.md, tellimine.md)
    const contactFile = path.join(sourceDir, 'contact.json');
    const aboutFile = path.join(sourceDir, 'artmoments.md');
    const orderingFile = path.join(sourceDir, 'tellimine.md');

    let phone = '+372 58194961';
    let email = 'mailbox@artmoments.ee';
    if (fs.existsSync(contactFile)) {
      const contact = JSON.parse(await fsp.readFile(contactFile, 'utf-8'));
      if (contact.phone) phone = String(contact.phone).trim();
      if (contact.email) email = String(contact.email).trim();
    }
    const aboutMarkdown = fs.existsSync(aboutFile) ? await fsp.readFile(aboutFile, 'utf-8') : '';
    const orderingMarkdown = fs.existsSync(orderingFile) ? await fsp.readFile(orderingFile, 'utf-8') : '';

    await this.repo.upsertGalleryInfo({
      projectId,
      title: 'ARTMOMENTS',
      subtitle: 'akrüülmaalid lõuendil',
      aboutMarkdown,
      orderingMarkdown,
      phone,
      email,
      logoLightUrl: `/media/${projectId}/assets/lillelogo1.svg`,
      logoDarkUrl: `/media/${projectId}/assets/lillelogo4.svg`,
    });

    return {
      authorsMigrated,
      categoriesMigrated,
      assetsCopied,
      infoMigrated: true,
    };
  }

  public async migratePaintingsBatch(options: {
    sourceDir?: string;
    projectId?: string;
    paintingFiles?: string[];
    offset?: number;
    limit?: number;
    copyMedia?: boolean;
    syncRelations?: boolean;
  } = {}): Promise<{
    paintingsMigrated: number;
    categoryLinksCreated: number;
    photosCopied: number;
    thumbnailsCopiedOrGenerated: number;
  }> {
    const sourceDir = path.resolve(options.sourceDir || 'Z:/artm2/gallery/data/db');
    const { projectId } = await this.repo.ensureProject(options.projectId);
    const paintingsDir = path.join(sourceDir, 'paintings');
    const photosDir = path.join(sourceDir, 'photos');
    const thumbsDir = path.join(sourceDir, 'thumbnails');
    const copyMedia = options.copyMedia ?? true;

    let files = options.paintingFiles;
    if (!files) {
      const all = (await fsp.readdir(paintingsDir)).filter((f) => f.endsWith('.json'));
      const offset = Number(options.offset || 0);
      const limit = Number(options.limit || all.length);
      files = all.slice(offset, offset + limit);
    }

    await this.storage.ensureBucketDir(projectId, 'photos');
    await this.storage.ensureBucketDir(projectId, 'thumbnails');

    // Index existing photo files in source photosDir case-insensitively
    const sourcePhotoLookup = new Map<string, string>();
    if (fs.existsSync(photosDir)) {
      for (const f of await fsp.readdir(photosDir)) {
        sourcePhotoLookup.set(f.toLowerCase(), f);
      }
    }
    const sourceThumbLookup = new Map<string, string>();
    if (fs.existsSync(thumbsDir)) {
      for (const f of await fsp.readdir(thumbsDir)) {
        sourceThumbLookup.set(f.toLowerCase(), f);
      }
    }

    let paintingsMigrated = 0;
    let categoryLinksCreated = 0;
    let photosCopied = 0;
    let thumbnailsCopiedOrGenerated = 0;

    for (const file of files) {
      const filePath = path.join(paintingsDir, file);
      if (!fs.existsSync(filePath)) continue;
      const data = JSON.parse(await fsp.readFile(filePath, 'utf-8'));

      const key = String(data.key || path.parse(file).name);
      const name = String(data.name || key);
      const link = String(data.link || slugifyLink(name));
      const authorKey = String(data.author || 'ANON').toUpperCase();
      const categoryKeys: string[] = Array.isArray(data.category)
        ? data.category.map((c: any) => String(c).toUpperCase())
        : [];
      const published = Boolean(data.published);

      // Resolve actual photo file in source photosDir
      let photoFilename: string | null = data.photo || null;
      if (!photoFilename || !sourcePhotoLookup.has(photoFilename.toLowerCase())) {
        for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
          const candidate = `${link}${ext}`.toLowerCase();
          if (sourcePhotoLookup.has(candidate)) {
            photoFilename = sourcePhotoLookup.get(candidate)!;
            break;
          }
        }
      } else {
        photoFilename = sourcePhotoLookup.get(photoFilename.toLowerCase())!;
      }

      let photoSize = 0;
      let photoUrl: string | null = null;
      let thumbnailUrl: string | null = null;

      if (photoFilename) {
        const { diskPath: destPhotoPath, url: resolvedPhotoUrl } = this.storage.resolveFilePath(
          projectId,
          'photos',
          photoFilename
        );
        photoUrl = resolvedPhotoUrl;

        const srcPhotoPath = path.join(photosDir, photoFilename);
        if (copyMedia && fs.existsSync(srcPhotoPath)) {
          if (!fs.existsSync(destPhotoPath)) {
            await fsp.copyFile(srcPhotoPath, destPhotoPath);
            photosCopied++;
          }
          try {
            const st = await fsp.stat(destPhotoPath);
            photoSize = st.size;
          } catch {}
        }

        const thumbBase = `${path.parse(photoFilename).name}.jpg`;
        const { diskPath: destThumbPath, url: resolvedThumbUrl } = this.storage.resolveFilePath(
          projectId,
          'thumbnails',
          thumbBase
        );
        thumbnailUrl = resolvedThumbUrl;

        if (copyMedia) {
          const matchedSourceThumb = sourceThumbLookup.get(thumbBase.toLowerCase());
          const srcThumbPath = matchedSourceThumb ? path.join(thumbsDir, matchedSourceThumb) : null;
          if (srcThumbPath && fs.existsSync(srcThumbPath)) {
            if (!fs.existsSync(destThumbPath)) {
              await fsp.copyFile(srcThumbPath, destThumbPath);
              thumbnailsCopiedOrGenerated++;
            }
          } else if (fs.existsSync(destPhotoPath) && !fs.existsSync(destThumbPath)) {
            await this.imageProcessor.generateThumbnail(destPhotoPath, destThumbPath, {
              width: 250,
              quality: 80,
              format: 'jpeg',
            });
            thumbnailsCopiedOrGenerated++;
          }
        }
      }

      await this.repo.upsertItem({
        projectId,
        key,
        name,
        link,
        photo: photoFilename,
        photoUrl,
        thumbnailUrl,
        authorKey,
        categoryKeys,
        published,
        size: photoSize || null,
        syncRelations: options.syncRelations ?? false,
      });

      paintingsMigrated++;
      categoryLinksCreated += categoryKeys.length;
    }

    return {
      paintingsMigrated,
      categoryLinksCreated,
      photosCopied,
      thumbnailsCopiedOrGenerated,
    };
  }

  public async migrateAll(options: {
    sourceDir?: string;
    projectId?: string;
    copyMedia?: boolean;
    syncRelations?: boolean;
  } = {}): Promise<Artm2MigrationSummary> {
    const sourceDir = path.resolve(options.sourceDir || 'Z:/artm2/gallery/data/db');
    const { projectId } = await this.repo.ensureProject(options.projectId);

    const metaRes = await this.migrateMetadataAndAssets({ sourceDir, projectId });
    const batchRes = await this.migratePaintingsBatch({
      sourceDir,
      projectId,
      copyMedia: options.copyMedia ?? true,
      syncRelations: options.syncRelations ?? false,
    });

    return {
      projectId,
      sourceDir,
      authorsMigrated: metaRes.authorsMigrated,
      categoriesMigrated: metaRes.categoriesMigrated,
      paintingsMigrated: batchRes.paintingsMigrated,
      categoryLinksCreated: batchRes.categoryLinksCreated,
      photosCopied: batchRes.photosCopied,
      thumbnailsCopiedOrGenerated: batchRes.thumbnailsCopiedOrGenerated,
      assetsCopied: metaRes.assetsCopied,
      infoMigrated: metaRes.infoMigrated,
    };
  }
}

