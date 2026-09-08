export function normalizeText(text) {
  if (text == null) return '';
  return String(text).normalize('NFC').toLowerCase();
}

export function computeTrackFingerprint(artist, title, rawText) {
  const normArtist = (artist ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normTitle = (title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (normArtist || normTitle) return `${normArtist}___${normTitle}`;
  return (rawText ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function parseMusicEntry(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { artist: '', title: '', rawText: rawText ?? '' };
  }
  const cleaned = rawText.trim();
  const dashSeparated = cleaned.split(/\s+[-–—]\s+/);
  if (dashSeparated.length >= 2) {
    const artist = dashSeparated[0].trim();
    const title = dashSeparated.slice(1).join(' - ').trim();
    return { artist, title, rawText: cleaned };
  }
  return { artist: '', title: cleaned, rawText: cleaned };
}

export function fuzzyMatch(text, search) {
  if (!search) return true;
  if (!text) return false;
  const normText = normalizeText(text);
  const normSearch = normalizeText(search);
  return normText.includes(normSearch);
}
