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
        const response = await fetch(new URL(path, this.options.baseUrl), {
          headers: { 'User-Agent': this.options.userAgent, Accept: responseType === 'json' ? 'application/json' : 'text/html' },
          signal: AbortSignal.timeout(this.options.requestTimeoutMs)
        });
        this.lastRequestAt = Date.now();
        if (!response.ok) {
          if (![429, 500, 502, 503, 504].includes(response.status) || attempt === this.options.maxRetries) {
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
    return this.request(new URL(url).pathname, 'text');
  }
}