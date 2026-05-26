import * as vscode from 'vscode';
import { WikiApiClient, WikiSource } from './api';
import { curatorLog } from './log';

export class WikiTreeDataProvider implements vscode.TreeDataProvider<WikiNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<WikiNode | null | undefined> = new vscode.EventEmitter<WikiNode | null | undefined>();
  readonly onDidChangeTreeData: vscode.Event<WikiNode | null | undefined> = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WikiNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WikiNode): Promise<WikiNode[]> {
    const api = new WikiApiClient(this.context);
    try {
      if (!element) {
        // Root nodes
        const children = await api.getWikiChildren('');
        curatorLog.appendLine('[Curator] Root wiki children: ' + JSON.stringify(children));
        if (children.length === 0) {
          vscode.window.showWarningMessage('Curator: No wiki pages found at root.');
        }
        return children.map(child => new WikiNode(child, this.context));
      } else {
        const children = await api.getWikiChildren(element.source.materializedPath);
        curatorLog.appendLine(`[Curator] Wiki children for ${element.source.materializedPath}: ${JSON.stringify(children)}`);
        return children.map(child => new WikiNode(child, this.context));
      }
    } catch (err) {
      curatorLog.appendLine('[Curator] Error fetching wiki children: ' + (err && err.toString ? err.toString() : String(err)));
      curatorLog.show(true);
      vscode.window.showErrorMessage('Curator: Failed to load wiki pages. See Curator Logs output for details.');
      return [];
    }
  }
}

export class WikiNode extends vscode.TreeItem {
  constructor(
    public readonly source: WikiSource,
    private context: vscode.ExtensionContext
  ) {
    super(source.title || source.materializedPath, (source._count && source._count.children > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.resourceUri = vscode.Uri.parse(`wiki:/${source.materializedPath}`);
    this.contextValue = 'wikiNode';
    this.tooltip = source.materializedPath;
    this.iconPath = (source._count && source._count.children > 0)
      ? 'folder' : 'file';
    this.command = (source._count && source._count.children > 0) ? undefined : {
      command: 'vscode.open',
      title: 'Open Wiki Page',
      arguments: [this.resourceUri]
    };
  }
}
