/**
 * Markdown and Mermaid rendering for model output, loaded on first use. Model output is untrusted: raw HTML in
 * Markdown is dropped, the result is sanitized with DOMPurify, links open in a new tab without opener access, and
 * Mermaid runs with `securityLevel: 'strict'`. When a library can't be loaded, callers fall back to plain text.
 */

let markdownRenderer: Promise<((text: string) => string) | null> | null = null;
let mermaidLib: Promise<any | null> | null = null;
let mermaidSeq = 0;

async function loadMarkdown(): Promise<((text: string) => string) | null> {
  try {
    // @ts-ignore optional dependency, loaded lazily
    const [{ Marked }, purifyMod] = await Promise.all([import('marked'), import('dompurify')]);
    const DOMPurify = (purifyMod as any).default ?? purifyMod;
    const marked = new Marked({ gfm: true, breaks: true, renderer: { html: () => '' } as any });
    DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return (text: string) => DOMPurify.sanitize(String(marked.parse(text ?? '', { async: false })), { USE_PROFILES: { html: true } });
  } catch {
    return null;
  }
}

/** Sanitized HTML for Markdown text, or null when the renderer isn't available. */
export async function renderMarkdown(text: string): Promise<string | null> {
  markdownRenderer ??= loadMarkdown();
  const render = await markdownRenderer;
  if (!render) return null;
  try {
    return render(text);
  } catch {
    return null;
  }
}

/** SVG markup for a Mermaid diagram, or null when Mermaid isn't available or the diagram is invalid. */
export async function renderMermaid(code: string): Promise<{ svg: string } | { error: string } | null> {
  mermaidLib ??= (async () => {
    try {
      // @ts-ignore optional dependency, loaded lazily
      const mod: any = await import('mermaid');
      const mermaid = mod.default ?? mod;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      return mermaid;
    } catch {
      return null;
    }
  })();
  const mermaid = await mermaidLib;
  if (!mermaid) return null;
  try {
    const { svg } = await mermaid.render(`harness-mermaid-${++mermaidSeq}`, code);
    return { svg };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}

/** Image sources the panel may load: data URLs of images, and URLs on this origin (project resources). */
export function isAllowedImageSource(src: unknown): src is string {
  if (typeof src !== 'string' || !src) return false;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(src)) return true;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    return typeof window !== 'undefined' && new URL(src).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** A sandboxed document for html/svg surfaces: no network, no access to the app (used with sandbox="allow-scripts"). */
export function sandboxDocument(content: string): string {
  const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>body{margin:8px;font-family:system-ui,sans-serif}</style></head><body>${content}</body></html>`;
}
