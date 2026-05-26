
import * as vscode from 'vscode';
import { WikiTreeDataProvider } from './WikiTreeDataProvider';
import { WikiFileSystemProvider } from './WikiFileSystemProvider';
import { authenticate } from './auth';



export function activate(context: vscode.ExtensionContext) {
            console.log('[Curator] Extension activated!');
        // Register the Wiki tree view in the Curator activity bar
        const wikiTreeDataProvider = new WikiTreeDataProvider(context);
        const treeView = vscode.window.createTreeView('curator-filesystem', {
            treeDataProvider: wikiTreeDataProvider,
            showCollapseAll: true
        });
        context.subscriptions.push(treeView);
    // Register Hello World command (keep for now)
    const helloWorld = vscode.commands.registerCommand('curator.helloWorld', () => {
        vscode.window.showInformationMessage('Hello from Curator!');
    });
    context.subscriptions.push(helloWorld);

    // Register Sign In command
    const signIn = vscode.commands.registerCommand('curator.signIn', async () => {
        await authenticate(context);
    });
    context.subscriptions.push(signIn);

    // Register the Wiki virtual filesystem provider under the 'wiki' scheme
    const wikiFsProvider = new WikiFileSystemProvider(context);
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('wiki', wikiFsProvider, { isCaseSensitive: true })
    );

    // Optionally, reveal the wiki: root in the explorer (future)
}

export function deactivate() {}
