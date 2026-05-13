import type { PrismaClient } from '@prisma/client';
import { BrowserService } from '../BrowserService.js';
import { ScraperService } from '../ScraperService.js';

export interface BrowserCommand {
    type: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'content' | 'extract';
    url?: string;
    selector?: string;
    text?: string;
    timeout?: number;
    optional?: boolean; // If true, failure won't stop the command sequence
}

export interface BrowserActionInput {
    sessionId?: string;
    useCdp?: boolean; // New: Explicitly choose between local browser (true) or isolated (false)
    commands: BrowserCommand[];
}

/**
 * browser_action tool
 * Performs a sequence of browser commands using Playwright.
 * Useful for login flows, interacting with SPAs, or searching sites that block simple fetches.
 */
export async function browserAction(
    args: BrowserActionInput,
    _prisma: PrismaClient,
    _userId: string
) {
    const { sessionId, useCdp, commands } = args;

    if (!commands || !Array.isArray(commands)) {
        throw new Error('browser_action: "commands" array is required');
    }

    return await BrowserService.run(sessionId, useCdp, async (page, _context) => {
        const results: any[] = [];

        for (const cmd of commands) {
            console.log(`[Browser] Executing: ${cmd.type}`, cmd.url || cmd.selector || '');

            try {
                switch (cmd.type) {
                    case 'navigate':
                        await page.goto(cmd.url!, { waitUntil: 'networkidle', timeout: cmd.timeout || 30000 });
                        results.push({ type: 'navigate', url: page.url() });
                        break;

                    case 'click':
                        await page.click(cmd.selector!, { timeout: cmd.timeout || 10000 });
                        results.push({ type: 'click', selector: cmd.selector });
                        break;

                    case 'type':
                        await page.fill(cmd.selector!, cmd.text!, { timeout: cmd.timeout || 10000 });
                        results.push({ type: 'type', selector: cmd.selector });
                        break;

                    case 'wait':
                        if (cmd.selector) {
                            await page.waitForSelector(cmd.selector, { timeout: cmd.timeout || 10000 });
                        } else if (cmd.timeout) {
                            await page.waitForTimeout(cmd.timeout);
                        }
                        results.push({ type: 'wait' });
                        break;

                    case 'screenshot':
                        const buffer = await page.screenshot({ fullPage: true });
                        results.push({ type: 'screenshot', base64: buffer.toString('base64') });
                        break;

                    case 'content':
                        const html = await page.content();
                        results.push({ type: 'content', html });
                        break;

                    case 'extract':
                        const pageHtml = await page.content();
                        const scrapeResult = ScraperService.extractFromHtml(pageHtml, page.url());
                        results.push({ type: 'extract', markdown: scrapeResult.content });
                        break;

                    default:
                        throw new Error(`Unknown browser command type: ${cmd.type}`);
                }
            } catch (err) {
                if (cmd.optional) {
                    console.warn(`[Browser] Optional command failed: ${cmd.type}`, (err as Error).message);
                    results.push({ type: cmd.type, error: (err as Error).message, failed: true });
                } else {
                    throw err;
                }
            }
        }

        const lastResult = results[results.length - 1];
        const finalHtml = await page.content();
        
        return {
            success: true,
            results,
            // Convenience fields for common use cases
            url: page.url(),
            html: finalHtml,
            markdown: lastResult?.type === 'extract' ? lastResult.markdown : ScraperService.extractFromHtml(finalHtml, page.url()).content
        };
    });
}
