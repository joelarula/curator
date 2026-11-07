import { createGalleryHost } from './host.ts';
import { createGalleryMcpServer } from './server/mcp.ts';
import { createGalleryClientShell } from './client/galleryClientShell.ts';
import { GalleryTool } from './models/index.ts';

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const command = argv[0] || 'help';

  if (command === 'mcp') {
    const host = await createGalleryHost({ quiet: true });
    await host.start(3000);
    const mcp = await createGalleryMcpServer({ host, transport: 'stdio' });
    await mcp.listen();
    return;
  }

  if (command === 'seed') {
    const host = await createGalleryHost({ autoSeed: true });
    console.log('[Gallery CLI] Seeded Gallery Curator host definitions.');
    await host.stop();
    return;
  }

  if (command === 'migrate:artm2' || command === 'migrate') {
    const sourceDir = argv[1] || process.env.ARTM2_SOURCE_DIR || 'Z:\\artm2\\gallery\\data\\db';
    const projectId = argv[2] || process.env.GALLERY_PROJECT_ID || 'artmoments';
    const host = await createGalleryHost({ projectId });
    console.log(`[Gallery CLI] Running ArtMoments migration from: ${sourceDir} into project '${projectId}'...`);
    const execOut = await host.runTool(GalleryTool.MIGRATE_ARTM2, {
      sourceDir,
      projectId,
      copyFiles: true,
      generateMissingThumbnails: true,
    });
    const result = execOut?.result !== undefined ? execOut.result : execOut;
    console.log('[Gallery CLI] Migration completed:', JSON.stringify(result, null, 2));
    await host.stop();
    return;
  }

  if (command === 'stats') {
    const projectId = argv[1] || process.env.GALLERY_PROJECT_ID || 'artmoments';
    const host = await createGalleryHost({ projectId, quiet: true });
    const execOut = await host.runTool(GalleryTool.GET_STATS, { projectId });
    const stats = execOut?.result !== undefined ? execOut.result : execOut;
    console.log(JSON.stringify(stats, null, 2));
    await host.stop();
    return;
  }

  if (command === 'repl' || command === 'shell') {
    const host = await createGalleryHost({
      actor: { interactive: true },
    });
    await host.start(3000);
    const channel: any = {
      runTool: (name: string, args: any) => host.runTool(name, args),
      send: async (_type: string, payload: any) => host.runTool(payload.tool, payload.args),
    };
    const shell = createGalleryClientShell({ channel });
    await shell.start();
    await host.stop();
    return;
  }

  console.log(`
Curator Gallery CLI
Usage:
  gallery seed                         Seed Curator database roles, tools, scripts & agents
  gallery migrate:artm2 [src] [proj]   Migrate Z:\\artm2 data, photos & thumbnails into Gallery
  gallery stats [proj]                 Print gallery catalog & storage statistics
  gallery mcp                          Start MCP Server over stdio
  gallery repl                         Launch interactive Curator Gallery REPL shell
`);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('cli.ts') || process.argv[1].endsWith('cli.js'));

if (isMain) {
  runCli().catch((err) => {
    console.error('[Gallery CLI] Error:', err);
    process.exit(1);
  });
}
