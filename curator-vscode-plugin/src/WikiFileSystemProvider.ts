
import * as vscode from 'vscode';
import { WikiApiClient } from './api';

/**
 * WikiFileSystemProvider
 *
 * Exposes WIKI_PAGE Source/Text content as a virtual filesystem in VS Code.
 * Only text content is supported in the initial version (no attachments).
 */
export class WikiFileSystemProvider implements vscode.FileSystemProvider {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  // --- Event Emitters ---
  private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

  // --- Required methods ---
  watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
    // No-op for now
    return { dispose: () => {} };
  }


  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    // Treat 'index' and any leaf name as files, others as directories
    const parts = uri.path.split('/').filter(Boolean);
    if (parts.length === 0) {
      // Root is always a directory
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    const last = parts[parts.length - 1];
    if (last === 'index') {
      // 'index' is always a file (folder text)
      return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 };
    }
    // For non-index, check if it's a leaf (file) or a directory
    let materializedPath = uri.path.replace(/^\//, '');
    if (materializedPath.endsWith('/')) materializedPath = materializedPath.slice(0, -1);
    const api = new WikiApiClient(this.context);
    const page = await api.getWikiPageByPath(materializedPath);
    if (!page) throw vscode.FileSystemError.FileNotFound(uri);
    // If the node has children, it's a directory; otherwise, it's a file
    const isDir = page._count && page._count.children > 0;
    return {
      type: isDir ? vscode.FileType.Directory : vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 0
    };
  }


  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    // Remove leading slash if present
    let materializedPath = uri.path.replace(/^\//, '');
    if (materializedPath.endsWith('/')) materializedPath = materializedPath.slice(0, -1);
    const api = new WikiApiClient(this.context);

    // If root, list all top-level wiki pages (parentId = null)
    let parentId: string | null = null;
    if (materializedPath) {
      const parentPage = await api.getWikiPageByPath(materializedPath);
      if (!parentPage) throw vscode.FileSystemError.FileNotFound(uri);
      parentId = parentPage.id;
    }

    // Always include 'index' for the current node (folder text)
    const entries: [string, vscode.FileType][] = [['index', vscode.FileType.File]];

    // Fetch children using API
    const children = await api.getWikiChildren(parentId);
    for (const child of children) {
      // If the child has children, it's a directory; otherwise, it's a file (leaf)
      const isDir = child._count && child._count.children > 0;
      entries.push([
        child.path || child.materializedPath,
        isDir ? vscode.FileType.Directory : vscode.FileType.File
      ]);
    }
    return entries;
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    // Remove leading slash if present
    let materializedPath = uri.path.replace(/^\//, '');
    const api = new WikiApiClient(this.context);
    let pagePath = materializedPath;
    let isIndex = false;
    if (materializedPath.endsWith('/index')) {
      // index for a folder: get the parent node's text
      isIndex = true;
      pagePath = materializedPath.replace(/\/index$/, '');
    } else if (materializedPath.endsWith('index')) {
      // index for a folder at root
      isIndex = true;
      pagePath = materializedPath.replace(/index$/, '');
      if (pagePath.endsWith('/')) pagePath = pagePath.slice(0, -1);
    } else {
      // leaf file: get the child node by name
      const parts = materializedPath.split('/');
      const fileName = parts.pop()!;
      const parentPath = parts.join('/');
      // Fetch children and find the matching child
      const children = await api.getWikiChildren(parentPath);
      const child = children.find((c: any) => c.path === fileName || c.materializedPath === fileName);
      if (child) {
        pagePath = child.materializedPath;
      }
    }
    const page = await api.getWikiPageByPath(pagePath);
    if (!page) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    const text = page.texts && page.texts.length > 0 ? page.texts[0].content : '';
    return Buffer.from(text, 'utf8');
  }

  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
    // TODO: Implement file write (save Text content)
    throw vscode.FileSystemError.Unavailable('writeFile not implemented');
  }

  delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
    // TODO: Implement delete (soft-delete Source/Text)
    throw vscode.FileSystemError.Unavailable('delete not implemented');
  }

  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
    // TODO: Implement rename (move/rename Source/Text)
    throw vscode.FileSystemError.Unavailable('rename not implemented');
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    // TODO: Implement directory creation (new wiki page)
    throw vscode.FileSystemError.Unavailable('createDirectory not implemented');
  }
}
