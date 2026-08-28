import { config } from './config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ErrClient {
  constructor(options = {}) {
    this.options = { ...config, ...options };
    this.lastRequestAt = 0;
  }

  async request(path, responseType = 'json') {
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      const wait = this.options.requestDelayMs - (Date.now() - this.lastRequestAt);
      if (wait > 0) await sleep(wait);
      try {
        const targetUrl = (path.startsWith('http://') || path.startsWith('https://'))
          ? path
          : new URL(path, this.options.baseUrl).toString();
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': responseType === 'json' ? 'application/json' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'et-EE,et;q=0.9,en-US;q=0.8,en;q=0.7'
          },
          signal: AbortSignal.timeout(this.options.requestTimeoutMs)
        });
        this.lastRequestAt = Date.now();
        if (!response.ok) {
          if (![429, 500, 502, 503, 504, 520].includes(response.status) || attempt === this.options.maxRetries) {
            throw new Error(`ERR request failed: ${response.status} ${response.statusText}`);
          }
          await sleep(500 * 2 ** attempt);
          continue;
        }
        return responseType === 'json' ? response.json() : response.text();
      } catch (error) {
        if (attempt === this.options.maxRetries) throw error;
        await sleep(500 * 2 ** attempt);
      }
    }
    throw new Error('Unreachable request state');
  }

  archive(params = {}) {
    const query = new URLSearchParams({
      seriesContentId: String(this.options.seriesContentId), radiomanUrl: '', limit: String(this.options.archiveLimit),
      ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined))
    });
    return this.request(`/api/broadcast/broadcasts?${query}`);
  }

  episode(url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return this.request(url, 'text');
    }
    return this.request(new URL(url).pathname, 'text');
  }
}