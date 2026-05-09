import * as http from 'http';
import * as vscode from 'vscode';

/**
 * Starts the loopback authentication flow for the Curator extension.
 * Opens the user's browser to the wiki login page with a callback to localhost.
 * Stores the JWT securely in SecretStorage.
 */
export async function authenticate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage('Wiki: Starting authentication flow...');
    console.log('Wiki: Starting authentication flow...');
    const server = http.createServer(async (req, res) => {
        console.log('Wiki: Received request:', req.url);
        const url = new URL(req.url!, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (token) {
            console.log('Wiki: Received token:', token);
            await context.secrets.store('wiki-auth-token', token);
            res.end('<h1>Login Successful! You can close this tab.</h1>');
            server.close();
            vscode.window.showInformationMessage('Wiki: Logged in successfully!');
        } else {
            console.log('Wiki: No token found in callback URL:', req.url);
            res.end('<h1>Authentication failed.</h1>');
            vscode.window.showErrorMessage('Wiki: Authentication failed. No token received.');
        }
    });

    server.listen(0, () => {
        const port = (server.address() as any).port;
        const authUrl = `http://localhost:4000/auth/google?callback=http://localhost:${port}/callback`;
        console.log('Wiki: Opening browser to:', authUrl);
        vscode.window.showInformationMessage(`Wiki: Please complete login in your browser. If stuck, check callback: ${authUrl}`);
        vscode.env.openExternal(vscode.Uri.parse(authUrl));
    });
}

/**
 * Retrieves the stored JWT from SecretStorage.
 */
export async function getStoredToken(context: vscode.ExtensionContext): Promise<string | undefined> {
    return await context.secrets.get('wiki-auth-token');
}
