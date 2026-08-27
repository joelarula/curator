export const config = {
  baseUrl: 'https://vikerraadio.err.ee',
  seriesContentId: 1037846,
  archiveLimit: 100,
  requestTimeoutMs: 20_000,
  requestDelayMs: Number(process.env.REQUEST_DELAY_MS ?? 1000),
  maxRetries: 3,
  userAgent: 'keeris-kauamangiv-scraper/1.0 (research use)',
  defaultDatabase: 'data/kauamangiv.sqlite'
};

export function parseDateOption(value) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}; expected YYYY-MM-DD`);
  return value;
}