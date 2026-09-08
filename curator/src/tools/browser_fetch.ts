import { defineTool } from './CuratorTool.js';
import { browserRelayService } from '../services/BrowserRelayService.js';

export const browser_fetch = defineTool({
  name: 'browser_fetch',
  description: 'Opens a web page in a connected browser worker (or fallback HTTP fetch) and extracts its rendered HTML, text, and metadata.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to open and render.',
      },
      waitForSelector: {
        type: 'string',
        description: 'Optional CSS selector to wait for before extracting content (e.g. "article", ".main-content").',
      },
      extract: {
        type: 'string',
        enum: ['all', 'html', 'text', 'metadata'],
        description: 'What content to extract (default: "all").',
      },
      timeoutMs: {
        type: 'number',
        description: 'Maximum timeout in milliseconds (default: 30000).',
      },
    },
    required: ['url'],
  },
  execute: async (args, _ctx) => {
    if (typeof args.url !== 'string' || args.url.length === 0) {
      throw new Error('browser_fetch: url parameter must be a non-empty string');
    }

    const extractMode = (args.extract as 'all' | 'html' | 'text' | 'metadata') || 'all';
    const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 30000;
    const waitForSelector = typeof args.waitForSelector === 'string' ? args.waitForSelector : undefined;

    const result = await browserRelayService.requestPage({
      url: args.url,
      waitForSelector,
      extract: extractMode,
      timeoutMs,
    });

    return {
      url: result.url,
      title: result.title,
      text: result.text,
      html: result.html ? result.html.substring(0, 10000) : undefined, // Truncate very large HTML in response payload
      isJsRendered: result.isJsRendered,
      durationMs: result.durationMs,
      workerId: result.workerId,
    };
  },
});
