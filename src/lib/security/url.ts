export function sanitizeLocationUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function isValidLocationUrl(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return true;
  return sanitizeLocationUrl(url) !== null;
}
