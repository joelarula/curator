export interface KeerisConfig {
  baseUrl: string;
  seriesContentId: number;
  archiveLimit: number;
  requestTimeoutMs: number;
  requestDelayMs: number;
  maxRetries: number;
  userAgent: string;
  defaultDatabase: string;
}

export const config: KeerisConfig = {
  baseUrl: 'https://vikerraadio.err.ee',
  seriesContentId: 1037846,
  archiveLimit: 100,
  requestTimeoutMs: 20_000,
  requestDelayMs: Number(process.env.REQUEST_DELAY_MS ?? 1000),
  maxRetries: 3,
  userAgent: 'keeris-kauamangiv-scraper/1.0 (research use)',
  defaultDatabase: process.env.DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/keeris'
};

export function parseDateOption(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}; expected YYYY-MM-DD`);
  return value;
}
