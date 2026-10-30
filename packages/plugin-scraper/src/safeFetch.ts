import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export interface SafeFetchOptions {
  /** Response bytes kept; the rest is cut off (default 2 MB). */
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Allow loopback/private targets. Tests only: a server-side fetcher must not reach internal networks. */
  allowPrivateNetworks?: boolean;
  userAgent?: string;
  acceptedTypes?: string[];
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

// Loopback, private, link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast, reserved.
const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net4, prefix, 'ipv4');
for (const [net6, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32],
] as const) blocked.addSubnet(net6, prefix, 'ipv6');

export function isBlockedAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) return blocked.check(address, 'ipv6');
  return true;
}

const DEFAULT_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];

/**
 * GET for untrusted URLs on a server: http(s) only, no credentials in the URL, every resolved
 * address checked inside the connection's own DNS lookup (no rebinding window), redirects re-checked,
 * bounded size and time, text content types only.
 */
export async function safeFetchText(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxRedirects = options.maxRedirects ?? 5;
  const types = options.acceptedTypes ?? DEFAULT_TYPES;
  const deadline = Date.now() + timeoutMs;

  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const target = parseTarget(current, options.allowPrivateNetworks === true);
    const res = await request(target, {
      timeoutMs: Math.max(deadline - Date.now(), 1),
      allowPrivate: options.allowPrivateNetworks === true,
      userAgent: options.userAgent ?? 'CuratorBlueprint/1.0 (+web_scrape)',
    });

    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      current = new URL(res.headers.location, target).toString();
      continue;
    }
    const contentType = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!types.includes(contentType)) {
      res.resume();
      throw new Error(`Unsupported content type "${contentType || 'unknown'}" (HTTP ${res.statusCode})`);
    }
    const { body, truncated } = await readLimited(res, maxBytes, deadline);
    return { finalUrl: target.toString(), status: res.statusCode ?? 0, contentType, body, truncated };
  }
  throw new Error(`Too many redirects (more than ${maxRedirects})`);
}

function parseTarget(raw: string, allowPrivate: boolean): URL {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new BlockedUrlError(`Invalid URL: ${raw}`);
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new BlockedUrlError(`Only http(s) URLs are allowed`);
  if (target.username || target.password) throw new BlockedUrlError('URLs with credentials are not allowed');
  const host = target.hostname.replace(/^\[|\]$/g, '');
  // IP literals never reach the DNS lookup hook, so check them here.
  if (net.isIP(host) && !allowPrivate && isBlockedAddress(host)) {
    throw new BlockedUrlError(`Address ${host} is not publicly routable`);
  }
  return target;
}

function guardedLookup(allowPrivate: boolean): net.LookupFunction {
  return (hostname, options: any, callback: any) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const list = addresses as unknown as dns.LookupAddress[];
      const bad = allowPrivate ? undefined : list.find((a) => isBlockedAddress(a.address));
      if (bad || list.length === 0) {
        return callback(new BlockedUrlError(`${hostname} resolves to a non-public address${bad ? ` (${bad.address})` : ''}`));
      }
      if (options?.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

function request(target: URL, opts: { timeoutMs: number; allowPrivate: boolean; userAgent: string }): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = target.protocol === 'https:' ? https : http;
    const req = mod.request(
      target,
      {
        method: 'GET',
        lookup: guardedLookup(opts.allowPrivate),
        headers: { 'User-Agent': opts.userAgent, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9' },
        timeout: opts.timeoutMs,
      },
      resolve
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

function readLimited(res: http.IncomingMessage, maxBytes: number, deadline: number): Promise<{ body: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => res.destroy(new Error('Response timed out')), Math.max(deadline - Date.now(), 1));
    const finish = (truncated: boolean) => {
      clearTimeout(timer);
      resolve({ body: Buffer.concat(chunks).toString('utf8'), truncated });
    };
    res.on('data', (chunk: Buffer) => {
      if (size + chunk.length > maxBytes) {
        chunks.push(chunk.subarray(0, maxBytes - size));
        size = maxBytes;
        res.destroy();
        finish(true);
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    res.on('end', () => finish(false));
    res.on('error', (err) => {
      clearTimeout(timer);
      if (size >= maxBytes) return;
      reject(err);
    });
  });
}
