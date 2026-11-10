import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createGalleryHost,
  executeGraphql,
  createGalleryMcpServer,
  GalleryTool,
  type GalleryHost,
} from '../src/index.ts';

// Minimal 1x1 PNG buffer for testing upload & thumbnail generation
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function unwrapTool<T = any>(execOut: any): T {
  return (execOut?.result !== undefined ? execOut.result : execOut) as T;
}

describe('Curator Gallery MiniApp Integration Suite', () => {
  let tmpDir: string;
  let host: GalleryHost;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-gallery-test-'));
    host = await createGalleryHost({
      projectId: 'artmoments',
      projectName: 'Artmoments Test Gallery',
      dataDir: tmpDir,
      curatorDbPath: path.join(tmpDir, 'test-gallery-curator.db'),
      quiet: true,
    });
    await host.start(2000);
  });

  after(async () => {
    try {
      await host.stop();
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. stores authors, categories (with ResourceTree), and paintings (with Attachment & Relation) in Curator Core DB', async () => {
    // Upsert Author via AST tool
    const author = unwrapTool(
      await host.runTool(GalleryTool.UPSERT_AUTHOR, {
        key: 'DI',
        name: 'Kadi Kiho',
        bio: 'Acrylic painter',
      })
    );
    assert.equal(author.key, 'DI');
    assert.equal(author.name, 'Kadi Kiho');

    // Upsert Category via AST tool
    const category = unwrapTool(
      await host.runTool(GalleryTool.UPSERT_CATEGORY, {
        key: 'ABSTRACT',
        name: 'Abstraktne',
        nameEn: 'Abstract',
        link: 'abstraktne',
        published: true,
        sortOrder: 1,
      })
    );
    assert.equal(category.key, 'ABSTRACT');
    assert.equal(category.link, 'abstraktne');

    // Upload & ingest a painting with base64 image data
    const ingested = unwrapTool(
      await host.runTool(GalleryTool.UPLOAD_AND_INGEST, {
        key: '101_a',
        name: '101 A',
        authorKey: 'DI',
        categoryKeys: ['ABSTRACT'],
        published: true,
        filename: '101_a.png',
        dataBase64: TINY_PNG_BASE64,
        description: 'Test acrylic painting on canvas',
      })
    );

    assert.ok(ingested.item, 'Expected item from upload_and_ingest');
    assert.equal(ingested.item.key, '101_a');
    assert.equal(ingested.item.slug, '101-a');
    assert.equal(ingested.item.projectSlug, 'artmoments');
    assert.equal(ingested.item.authorKey, 'DI');
    assert.equal(ingested.item.authorName, 'Kadi Kiho');
    assert.deepEqual(ingested.item.categoryKeys, ['ABSTRACT']);
    assert.ok(ingested.item.photoUrl?.includes('/media/artmoments/photos/101_a.png'));
    assert.ok(ingested.item.thumbnailUrl?.includes('/media/artmoments/thumbnails/101_a.jpg'));

    // Verify files exist on VM file storage disk and can be resolved by SEO slug
    const photoResolved = host.storageService.resolveFilePath('artmoments', 'photos', '101_a.png');
    assert.equal(photoResolved.projectSlug, 'artmoments');
    assert.equal(photoResolved.slug, '101-a');
    assert.equal(photoResolved.relativePath, 'artmoments/photos/101_a.png');
    assert.ok(fs.existsSync(photoResolved.diskPath), 'Photo file must exist on VM file storage');
    const foundBySlug = host.storageService.findFileBySlugOrFilename('artmoments', 'photos', '101-a');
    assert.equal(foundBySlug?.slug, '101-a');
    assert.equal(foundBySlug?.filename, '101_a.png');
    const thumbResolved = host.storageService.resolveFilePath('artmoments', 'thumbnails', '101_a.jpg');
    assert.equal(thumbResolved.slug, '101-a');
    assert.equal(thumbResolved.relativePath, 'artmoments/thumbnails/101_a.jpg');
    assert.ok(fs.existsSync(thumbResolved.diskPath), '250px thumbnail must exist on VM file storage');

    // Verify Attachment belongs to Project (`projectId`), has SEO `slug`, and keeps ONLY the relative path
    const dbAttachment = await host.galleryRepo.prisma.attachment.findUnique({
      where: { uri: 'attachment:artmoments:photos:101_a.png' },
    });
    assert.equal(dbAttachment?.projectId, 'artmoments');
    assert.equal(dbAttachment?.slug, '101-a');
    assert.equal(dbAttachment?.url, 'artmoments/photos/101_a.png');
    assert.equal(ingested.item.metadata.photoPath, 'artmoments/photos/101_a.png');
    assert.equal(ingested.item.metadata.thumbnailPath, 'artmoments/thumbnails/101_a.jpg');
  });

  it('2. returns interactive uiSurface for "show app resources" in Grid and List modes', async () => {
    const surfaceResult = unwrapTool(
      await host.runTool(GalleryTool.SHOW_RESOURCES, {
        viewMode: 'grid',
      })
    );
    assert.ok(surfaceResult.uiSurface, 'Expected uiSurface descriptor');
    assert.equal(surfaceResult.uiSurface.component, 'resource-collection');
    assert.equal(surfaceResult.uiSurface.viewMode, 'grid');
    assert.equal(surfaceResult.uiSurface.total, 1);
    assert.equal(surfaceResult.uiSurface.items[0].key, '101_a');

    // Also test natural-language speech tool ("show app resources in list view")
    const speechResult = unwrapTool(
      await host.runTool(GalleryTool.SPEECH, {
        speech: 'show app resources in list view',
      })
    );
    assert.ok(speechResult.uiSurface, 'Expected uiSurface from speech command');
    assert.equal(speechResult.uiSurface.viewMode, 'list');
    assert.equal(speechResult.uiSurface.items.length, 1);
  });

  it('3. serves public & admin GraphQL queries and mutations', async () => {
    const gqlRes = await executeGraphql(
      `query TestPublicGallery {
        galleryInfo {
          projectId title phone email
        }
        galleryCategories {
          key name link paintingCount
        }
        galleryAuthors {
          key name paintingCount
        }
        galleryItems(categoryLink: "abstraktne") {
          key name title link photoUrl thumbnailUrl authorKey authorName
          categories { key name }
        }
        galleryItem(link: "101-a") {
          key name authorName
        }
        galleryStats {
          totalItems publishedItems categoriesCount authorsCount attachmentsCount
        }
      }`,
      {},
      { host, projectId: 'artmoments' }
    );

    assert.equal(gqlRes.errors, undefined, `GraphQL errors: ${JSON.stringify(gqlRes.errors)}`);
    const data = gqlRes.data as any;
    assert.equal(data.galleryInfo.projectId, 'artmoments');
    assert.equal(data.galleryCategories.length, 1);
    assert.equal(data.galleryCategories[0].paintingCount, 1);
    assert.equal(data.galleryAuthors.length, 1);
    assert.equal(data.galleryAuthors[0].paintingCount, 1);
    assert.equal(data.galleryItems.length, 1);
    assert.equal(data.galleryItems[0].key, '101_a');
    assert.equal(data.galleryItem.name, '101 A');
    assert.equal(data.galleryStats.totalItems, 1);

    // Database health needs the db.status action: refused anonymously, allowed for a manager (super-admin)
    const healthQuery = `query Health { curatorDatabaseHealth { storageEngine tables { name rowCount } } }`;
    const anonymous = await executeGraphql(healthQuery, {}, { host, projectId: 'artmoments' });
    assert.match(String(anonymous.errors?.[0]?.message), /db\.status/);
    const manager = await (host as any).definitionsPrisma.user.findFirst({ where: { email: 'joel.arula@gmail.com' } });
    assert.ok(manager, 'Expected the seeded gallery manager');
    const health = await executeGraphql(healthQuery, {}, { host, projectId: 'artmoments', user: { id: manager.id, email: manager.email } });
    assert.equal(health.errors, undefined, `GraphQL errors: ${JSON.stringify(health.errors)}`);
    assert.ok((health.data as any).curatorDatabaseHealth.tables.length >= 5);
  });

  it('4. exposes gallery, storage, and image tools over MCP Server and executes them durably', async () => {
    const mcp = await createGalleryMcpServer({ host });
    const tools = mcp.registry.list();
    const toolNames = tools.map((t) => t.name);

    assert.ok(toolNames.includes(GalleryTool.SHOW_RESOURCES), 'MCP must expose gallery_show_resources');
    assert.ok(toolNames.includes(GalleryTool.SEARCH_ITEMS), 'MCP must expose gallery_search_items');
    assert.ok(toolNames.includes('storage_upload_file'), 'MCP must expose storage_upload_file');
    assert.ok(toolNames.includes('image_inspect'), 'MCP must expose image_inspect');

    const callRes = await mcp.registry.call(GalleryTool.SEARCH_ITEMS, {
      search: '101',
    });
    assert.ok(!callRes.isError, 'MCP tool call should succeed');
    const parsed = JSON.parse(callRes.content[0].text);
    const items = parsed?.result?.items || parsed?.items || [];
    assert.equal(items.length, 1);
    assert.equal(items[0].key, '101_a');
  });

  it('5. seeds project-to-email configuration from gallery.config.yaml and resolves Google Auth user projects & GraphQL me', async () => {
    const authSeed = await host.seedProjectEmails();
    assert.ok(
      authSeed.projectsSeeded.includes('artmoments'),
      'Expected artmoments project to be seeded from gallery.config.yaml'
    );
    assert.ok(
      authSeed.usersSeeded.includes('joel.arula@gmail.com'),
      'Expected joel.arula@gmail.com to be seeded'
    );
    assert.ok(
      authSeed.usersSeeded.includes('mailbox@artmoments.ee'),
      'Expected mailbox@artmoments.ee to be seeded'
    );

    const userProjects = await host.getUserProjects({ email: 'joel.arula@gmail.com' });
    const artmomentsAccess = userProjects.find((p) => p.id === 'artmoments');
    assert.ok(artmomentsAccess, 'Expected joel.arula@gmail.com to have artmoments project access');
    assert.ok(artmomentsAccess.roles.includes('curator_manager'));
    assert.ok(artmomentsAccess.roles.includes('gallery_admin'));

    // Verify GraphQL `me` query with authenticated user context
    const meRes = await executeGraphql(
      `query TestMe {
        me {
          email
          roles { name }
          defaultProjectId
          projects {
            id
            name
            roles
          }
        }
      }`,
      {},
      {
        host,
        projectId: 'artmoments',
        user: {
          sub: 'test-user-id',
          email: 'joel.arula@gmail.com',
          name: 'Joel Arula',
          roles: ['curator_manager', 'gallery_admin', 'gallery_curator'],
        },
      }
    );
    assert.equal(meRes.errors, undefined, `GraphQL me errors: ${JSON.stringify(meRes.errors)}`);
    const meData = (meRes.data as any).me;
    assert.equal(meData.email, 'joel.arula@gmail.com');
    assert.equal(meData.defaultProjectId, 'artmoments');
    assert.ok(meData.projects.some((p: any) => p.id === 'artmoments'));
  });

  it('6. supports public-facing GraphQL photo search, category/author filtering, paging (publicGalleryPage), and stepping (publicGalleryPhoto)', async () => {
    // Ingest 2 more public paintings + 1 unpublished draft painting
    await host.runTool(GalleryTool.UPLOAD_AND_INGEST, {
      key: '102_b',
      name: '102 B',
      authorKey: 'DI',
      categoryKeys: ['ABSTRACT'],
      published: true,
      filename: '102_b.png',
      dataBase64: TINY_PNG_BASE64,
    });
    await host.runTool(GalleryTool.UPLOAD_AND_INGEST, {
      key: '103_c',
      name: '103 C',
      authorKey: 'DI',
      categoryKeys: ['ABSTRACT'],
      published: true,
      filename: '103_c.png',
      dataBase64: TINY_PNG_BASE64,
    });
    await host.runTool(GalleryTool.UPLOAD_AND_INGEST, {
      key: '104_draft',
      name: '104 Draft Secret',
      authorKey: 'DI',
      categoryKeys: ['ABSTRACT'],
      published: false,
      filename: '104_draft.png',
      dataBase64: TINY_PNG_BASE64,
    });

    // 1. Test publicGalleryPage (page 1, pageSize 2, filtered by category & author)
    const page1Res = await executeGraphql(
      `query TestPublicPage($category: String, $author: String, $page: Int, $pageSize: Int) {
        publicGalleryPage(category: $category, author: $author, page: $page, pageSize: $pageSize) {
          total
          page
          pageSize
          totalPages
          hasPreviousPage
          hasNextPage
          items {
            key
            name
            slug
            photoSlug
            published
          }
        }
      }`,
      { category: 'abstraktne', author: 'kadi-kiho', page: 1, pageSize: 2 },
      { host, projectId: 'artmoments' }
    );
    assert.equal(page1Res.errors, undefined, `page1 errors: ${JSON.stringify(page1Res.errors)}`);
    const page1 = (page1Res.data as any).publicGalleryPage;
    assert.equal(page1.total, 3, 'Only the 3 published photos must be visible in publicGalleryPage');
    assert.equal(page1.page, 1);
    assert.equal(page1.pageSize, 2);
    assert.equal(page1.totalPages, 2);
    assert.equal(page1.hasPreviousPage, false);
    assert.equal(page1.hasNextPage, true);
    assert.equal(page1.items.length, 2);
    assert.deepEqual(
      page1.items.map((i: any) => i.key),
      ['101_a', '102_b']
    );

    // 2. Test publicGalleryPage (page 2)
    const page2Res = await executeGraphql(
      `query TestPublicPage2 {
        publicGalleryPage(category: "abstraktne", page: 2, pageSize: 2) {
          total
          page
          totalPages
          hasPreviousPage
          hasNextPage
          items { key }
        }
      }`,
      {},
      { host, projectId: 'artmoments' }
    );
    const page2 = (page2Res.data as any).publicGalleryPage;
    assert.equal(page2.page, 2);
    assert.equal(page2.hasPreviousPage, true);
    assert.equal(page2.hasNextPage, false);
    assert.deepEqual(
      page2.items.map((i: any) => i.key),
      ['103_c']
    );

    // 3. Test publicGalleryPhoto stepping on middle photo ("102-b")
    const stepRes = await executeGraphql(
      `query TestPublicStep($slug: String!, $category: String) {
        publicGalleryPhoto(slug: $slug, category: $category, windowSize: 2) {
          position
          totalInSequence
          hasPrevious
          hasNext
          activeCategory { key name link }
          item { key name slug photoSlug }
          previousItem { key slug }
          nextItem { key slug }
          firstItem { key slug }
          lastItem { key slug }
          surroundingItems { key slug }
        }
      }`,
      { slug: '102-b', category: 'abstraktne' },
      { host, projectId: 'artmoments' }
    );
    assert.equal(stepRes.errors, undefined, `step errors: ${JSON.stringify(stepRes.errors)}`);
    const step = (stepRes.data as any).publicGalleryPhoto;
    assert.ok(step, 'Expected publicGalleryPhoto result for 102-b');
    assert.equal(step.item.key, '102_b');
    assert.equal(step.position, 2);
    assert.equal(step.totalInSequence, 3);
    assert.equal(step.hasPrevious, true);
    assert.equal(step.hasNext, true);
    assert.equal(step.previousItem.key, '101_a');
    assert.equal(step.nextItem.key, '103_c');
    assert.equal(step.firstItem.key, '101_a');
    assert.equal(step.lastItem.key, '103_c');
    assert.deepEqual(
      step.surroundingItems.map((i: any) => i.key),
      ['101_a', '102_b', '103_c']
    );

    // Ensure unpublished draft cannot be fetched via publicGalleryPhoto
    const draftStepRes = await executeGraphql(
      `query TestDraftHidden {
        publicGalleryPhoto(slug: "104-draft") {
          item { key }
        }
      }`,
      {},
      { host, projectId: 'artmoments' }
    );
    assert.equal((draftStepRes.data as any).publicGalleryPhoto, null);
  });

  it('7. generates full SEO manifest, XML sitemap (with image extensions), llms.txt, and JSON SEO index for external presentation frontends', async () => {
    // 1. Query GraphQL publicGallerySeoIndex
    const seoGqlRes = await executeGraphql(
      `query TestSeoIndex {
        publicGallerySeoIndex(baseUrl: "https://artmoments.ee") {
          projectId
          projectSlug
          canonicalBaseUrl
          totalRoutes
          totalPhotos
          totalCategories
          totalAuthors
          sitemapXmlUrl
          llmsTxtUrl
          site {
            title
            subtitle
            seo {
              title
              canonicalUrl
              jsonLd
            }
          }
          routes {
            path
            canonicalUrl
            type
            slug
            title
            changeFreq
            priority
            image { loc title }
          }
          items {
            key
            slug
            title
            path
            canonicalUrl
            authorName
            categoryNames
            photoUrl
          }
        }
      }`,
      {},
      { host, projectId: 'artmoments' }
    );
    assert.equal(seoGqlRes.errors, undefined, `SEO errors: ${JSON.stringify(seoGqlRes.errors)}`);
    const seoData = (seoGqlRes.data as any).publicGallerySeoIndex;
    assert.equal(seoData.projectId, 'artmoments');
    assert.equal(seoData.canonicalBaseUrl, 'https://artmoments.ee');
    assert.equal(seoData.totalPhotos, 3);
    assert.equal(seoData.totalCategories, 1);
    assert.equal(seoData.totalAuthors, 1);
    // Home (1) + Category (1) + Author (1) + 3 Photos (3) = 6 routes
    assert.equal(seoData.totalRoutes, 6);
    assert.equal(seoData.sitemapXmlUrl, 'https://artmoments.ee/sitemap.xml');
    assert.equal(seoData.llmsTxtUrl, 'https://artmoments.ee/llms.txt');

    // Verify canonical routes
    const paths = seoData.routes.map((r: any) => r.path);
    assert.ok(paths.includes('/'));
    assert.ok(paths.includes('/category/abstraktne'));
    assert.ok(paths.includes('/author/kadi-kiho'));
    assert.ok(paths.includes('/painting/101-a'));
    assert.ok(paths.includes('/painting/102-b'));
    assert.ok(paths.includes('/painting/103-c'));
    // Ensure draft is not included in routes or items
    assert.ok(!paths.includes('/painting/104-draft'));
    assert.ok(!seoData.items.some((i: any) => i.key === '104_draft'));

    // 2. Test Sitemap XML generation with Google Image namespace
    const sitemapXml = await host.galleryRepo.generateSitemapXml({
      projectId: 'artmoments',
      baseUrl: 'https://artmoments.ee',
    });
    assert.ok(sitemapXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(sitemapXml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
    assert.ok(sitemapXml.includes('<loc>https://artmoments.ee/painting/101-a</loc>'));
    assert.ok(sitemapXml.includes('<image:loc>https://artmoments.ee/media/artmoments/photos/101_a.png</image:loc>'));

    // 3. Test robots.txt generation
    const robotsTxt = host.galleryRepo.generateRobotsTxt({ baseUrl: 'https://artmoments.ee' });
    assert.ok(robotsTxt.includes('User-agent: *'));
    assert.ok(robotsTxt.includes('Sitemap: https://artmoments.ee/sitemap.xml'));

    // 4. Test llms.txt generation for AI indexers
    const llmsTxt = await host.galleryRepo.generateLlmsTxt({
      projectId: 'artmoments',
      baseUrl: 'https://artmoments.ee',
    });
    assert.ok(llmsTxt.includes('# ARTMOMENTS'));
    assert.ok(llmsTxt.includes('## Categories'));
    assert.ok(llmsTxt.includes('## Authors'));
    assert.ok(llmsTxt.includes('Kadi Kiho'));
  });
});
