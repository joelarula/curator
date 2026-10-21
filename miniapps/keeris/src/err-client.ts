import { config, type KeerisConfig } from './config.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ErrClientOptions extends Partial<KeerisConfig> {}

export interface ErrArchiveBroadcast {
  id: number | string;
  url: string;
  heading: string;
  scheduleStart: number | string;
  [key: string]: unknown;
}

export interface ErrArchiveResponse {
  data: ErrArchiveBroadcast[];
  previous?: string | null;
  years?: number[];
  [key: string]: unknown;
}

export interface OrpheusArchiveMonth {
  dateSeconds: number;
  date?: string;
  data: Array<{
    id: number | string;
    heading: string;
    combinedTime: number;
    photo?: unknown;
    mediaIds?: string[];
    [key: string]: unknown;
  }>;
}

export interface OrpheusArchiveResponse {
  years: number[];
  activeYear: OrpheusArchiveMonth[];
  [key: string]: unknown;
}

export interface OrpheusContentResponse {
  status: string;
  message?: string;
  data: {
    content?: {
      id: number | string;
      heading?: string;
      lead?: string;
      body?: string;
      combinedTime?: number;
      scheduleStart?: number;
      publicStart?: number;
      parentContentId?: number;
      url?: string;
      medias?: string[];
      [key: string]: unknown;
    };
    parentContent?: {
      id: number | string;
      heading?: string;
      [key: string]: unknown;
    };
    playlist?: Array<{
      id: number | string;
      artist?: string | null;
      title?: string | null;
      author?: string | null;
      duration?: number;
      seekSeconds?: number;
      seekTime?: string;
      [key: string]: unknown;
    }>;
    media?: Array<{
      id: number | string;
      podcastUrl?: string;
      mediaHash?: string;
      durationText?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
}

export class ErrClient {
  public options: KeerisConfig;
  private lastRequestAt: number;

  constructor(options: ErrClientOptions = {}) {
    this.options = { ...config, ...options };
    this.lastRequestAt = 0;
  }

  async request<T = unknown>(path: string, responseType: 'json' | 'text' = 'json'): Promise<T> {
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
        return (responseType === 'json' ? response.json() : response.text()) as Promise<T>;
      } catch (error) {
        if (attempt === this.options.maxRetries) throw error;
        await sleep(500 * 2 ** attempt);
      }
    }
    throw new Error('Unreachable request state');
  }

  radioArchive(seriesContentId: number | string, year?: number | string): Promise<OrpheusArchiveResponse> {
    const yearQuery = year ? `?year=${year}` : '';
    return this.request<OrpheusArchiveResponse>(`/api/v1/radio/archive/${seriesContentId}${yearQuery}`);
  }

  getContent(contentId: number | string): Promise<OrpheusContentResponse> {
    return this.request<OrpheusContentResponse>(`/api/v1/getContent/${contentId}`);
  }

  media(mediaId: number | string): Promise<unknown> {
    return this.request<unknown>(`/api/v1/media/${mediaId}`);
  }

  async archive(params: Record<string, unknown> = {}): Promise<ErrArchiveResponse> {
    const seriesContentId = String(params.seriesContentId ?? this.options.seriesContentId);

    // Resolve year from params (can be passed as year, or unixTime from previous cursor)
    let requestedYear: string | number | undefined = params.year as (string | number | undefined);
    if (!requestedYear && params.unixTime) {
      const uStr = String(params.unixTime);
      if (/^\d{4}$/.test(uStr)) {
        requestedYear = Number(uStr);
      } else {
        const ts = Number(uStr);
        if (Number.isFinite(ts) && ts > 0) {
          requestedYear = new Date(ts * 1000).getFullYear();
        }
      }
    }

    try {
      const orpheus = await this.radioArchive(seriesContentId, requestedYear);
      const activeEpisodes: ErrArchiveBroadcast[] = [];
      for (const month of (orpheus.activeYear || [])) {
        for (const ep of (month.data || [])) {
          activeEpisodes.push({
            id: ep.id,
            url: `https://eestiraadio.err.ee/vikerraadio/${ep.id}`,
            heading: ep.heading,
            scheduleStart: ep.combinedTime,
            publicStart: ep.combinedTime,
            mediaIds: ep.mediaIds,
            photo: ep.photo,
          });
        }
      }

      // Calculate previous cursor (the next older year in orpheus.years)
      const currentYearNum = requestedYear ? Number(requestedYear) : (orpheus.years?.[0] ?? new Date().getFullYear());
      const years = orpheus.years || [];
      const currentIdx = years.indexOf(currentYearNum);
      const nextYear = currentIdx >= 0 && currentIdx < years.length - 1 ? String(years[currentIdx + 1]) : null;

      const limit = Number(params.limit ?? this.options.archiveLimit);
      const data = (limit > 0 && activeEpisodes.length > limit && !params.all)
        ? activeEpisodes.slice(0, limit)
        : activeEpisodes;

      return {
        data,
        previous: nextYear,
        years,
      };
    } catch (_err) {
      // Legacy fallback
      const query = new URLSearchParams({
        seriesContentId,
        radiomanUrl: '',
        limit: String(this.options.archiveLimit),
        ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined).map(([k, v]) => [k, String(v)]))
      });
      return this.request<ErrArchiveResponse>(`/api/broadcast/broadcasts?${query}`);
    }
  }

  async episode(url: string): Promise<string> {
    const idMatch = String(url).match(/\/(\d+)(?:\/|$|\?)/);
    if (idMatch) {
      const id = idMatch[1];
      try {
        const res = await this.getContent(id);
        const content = res?.data?.content;
        if (content) {
          const playlist = res?.data?.playlist || [];
          const escapeHtml = (s?: string | null) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const publishedIso = content.combinedTime ? new Date(content.combinedTime * 1000).toISOString() : '';
          return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(content.heading)}</title>
  <meta name="description" content="${escapeHtml(content.lead)}">
  ${publishedIso ? `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "RadioEpisode",
    "name": content.heading,
    "datePublished": publishedIso,
    "description": content.lead
  })}</script>` : ''}
</head>
<body>
  <article class="radio-article">
    <div class="lead">${escapeHtml(content.lead)}</div>
    <div class="radio-article-body">${content.body || ''}</div>
    <div class="music-list">
      ${playlist.map((t) => `<div class="music-list-item"><span class="music-artist">${escapeHtml(t.artist)}</span> - <span class="music-title">${escapeHtml(t.title)}</span></div>`).join('\n      ')}
    </div>
  </article>
</body>
</html>`;
        }
      } catch (_) {
        // Fall back to direct fetching if getContent fails
      }
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return this.request<string>(url, 'text');
    }
    return this.request<string>(new URL(url, this.options.baseUrl).pathname, 'text');
  }
}
