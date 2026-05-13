import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'path';
import fs from 'fs/promises';

/**
 * BrowserService
 * Manages a Playwright browser instance for automated interaction, 
 * session handling, and advanced scraping.
 */
export class BrowserService {
    private static instance: Browser | null = null;
    private static storagePath = path.join(process.cwd(), 'storage', 'browser');

    private static async getBrowser(forceCdp?: boolean): Promise<Browser> {
        if (this.instance) {
            return this.instance;
        }

        const remotePort = process.env.CHROME_REMOTE_DEBUG_PORT;

        // Strategy: CDP (Local Chrome)
        if (forceCdp === true || (forceCdp === undefined && remotePort)) {
            const port = remotePort || '9222';
            console.log(`[BrowserService] Connecting to existing Chrome on 127.0.0.1:${port}...`);
            try {
                this.instance = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
                return this.instance;
            } catch (err) {
                if (forceCdp === true) throw new Error(`Failed to connect to Chrome on port ${port}: ${(err as Error).message}`);
                console.warn(`[BrowserService] Failed to connect to port ${port}. Falling back to local launch.`);
            }
        }

        // Strategy: Isolated Local Launch
        console.log('[BrowserService] Launching new local Chromium instance...');
        this.instance = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        return this.instance;
    }

    /**
     * Executes a series of actions in a browser context.
     * 
     * @param sessionId Optional ID to persist/reuse cookies and local storage.
     * @param actions   A function that receives a Page and performs work.
     */
    static async run<T>(
        sessionId: string | null | undefined,
        forceCdp: boolean | undefined,
        actions: (page: Page, context: BrowserContext) => Promise<T>
    ): Promise<T> {
        const browser = await this.getBrowser(forceCdp);
        
        let storageState: string | undefined = undefined;
        let sessionFile: string | undefined = undefined;

        if (sessionId) {
            sessionFile = path.join(this.storagePath, `session_${sessionId}.json`);
            try {
                await fs.mkdir(this.storagePath, { recursive: true });
                const exists = await fs.access(sessionFile).then(() => true).catch(() => false);
                if (exists) {
                    storageState = sessionFile;
                }
            } catch (err) {
                console.error(`[BrowserService] Failed to check session file: ${err}`);
            }
        }

        const context = await browser.newContext({ storageState });
        const page = await context.newPage();

        try {
            const result = await actions(page, context);
            
            // Save state if we have a session ID
            if (sessionId && sessionFile) {
                await context.storageState({ path: sessionFile });
            }

            return result;
        } finally {
            await page.close();
            await context.close();
        }
    }

    static async shutdown() {
        if (this.instance) {
            await this.instance.close();
            this.instance = null;
        }
    }
}
