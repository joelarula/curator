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
    assert.equal(ingested.item.authorKey, 'DI');
    assert.equal(ingested.item.authorName, 'Kadi Kiho');
    assert.deepEqual(ingested.item.categoryKeys, ['ABSTRACT']);
    assert.ok(ingested.item.photoUrl?.includes('/media/artmoments/photos/101_a.png'));
    assert.ok(ingested.item.thumbnailUrl?.includes('/media/artmoments/thumbnails/101_a.jpg'));

    // Verify files exist on VM file storage disk
    const photoResolved = host.storageService.resolveFilePath('artmoments', 'photos', '101_a.png');
    assert.ok(fs.existsSync(photoResolved.diskPath), 'Photo file must exist on VM file storage');
    const thumbResolved = host.storageService.resolveFilePath('artmoments', 'thumbnails', '101_a.jpg');
    assert.ok(fs.existsSync(thumbResolved.diskPath), '250px thumbnail must exist on VM file storage');
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
        curatorDatabaseHealth {
          storageEngine
          tables { name rowCount }
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
    assert.ok(data.curatorDatabaseHealth.tables.length >= 5);
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
});
