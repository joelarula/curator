

// api.ts
// Minimal GraphQL client for Curator extension
import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { getStoredToken } from './auth';
import { curatorLog } from './log';

export interface WikiSource {
  id: string;
  materializedPath: string;
  path?: string;
  title: string;
  texts?: { id: string; content: string; updatedAt: string }[];
  _count?: { children: number };
}


export class WikiApiClient {
  private apiUrl: string;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('curator');
    this.apiUrl = config.get('apiUrl', 'http://localhost:4000/graphql');
    this.context = context;
  }

  async getWikiPageByPath(materializedPath: string): Promise<WikiSource | null> {
    const token = await getStoredToken(this.context);
    const query = `query($path: String!) {\n  wikiPage(path: $path) {\n    id\n    materializedPath\n    title\n    texts(take: 1) { id content updatedAt }\n  }\n}`;
    const variables = { path: materializedPath };
    curatorLog.appendLine('[Curator] GraphQL getWikiPageByPath query: ' + query);
    curatorLog.appendLine('[Curator] GraphQL getWikiPageByPath variables: ' + JSON.stringify(variables));
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ query, variables })
    });
    const json = await res.json() as any;
    curatorLog.appendLine('[Curator] GraphQL getWikiPageByPath response: ' + JSON.stringify(json));
    return json.data?.wikiPage || null;
  }

  async getWikiChildren(parentMaterializedPath: string | null): Promise<WikiSource[]> {
    const token = await getStoredToken(this.context);
    const query = `
      query($parentId: ID) {
        wikiTree(parentId: $parentId) {
          id
          materializedPath
          path
          title
          _count { children }
        }
      }
    `;
    const variables: any = {};
    if (parentMaterializedPath) {
      variables.parentId = parentMaterializedPath;
    } else {
      variables.parentId = null;
    }
    curatorLog.appendLine('[Curator] GraphQL getWikiChildren query: ' + query);
    curatorLog.appendLine('[Curator] GraphQL getWikiChildren variables: ' + JSON.stringify(variables));
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ query, variables })
    });
    const json = await res.json() as any;
    curatorLog.appendLine('[Curator] GraphQL getWikiChildren response: ' + JSON.stringify(json));
    return json.data?.wikiTree || [];
  }
}
