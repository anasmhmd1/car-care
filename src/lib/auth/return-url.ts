/**
 * Accept only application-relative destinations after authentication.
 *
 * The callback travels through a query string and then a form submission, so
 * it can arrive encoded or decoded. Normalizing it here keeps the redirect
 * flow useful for deep links while rejecting protocol-relative and external
 * destinations.
 */
export function getSafeLocalReturnPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  try {
    const callback = decodeURIComponent(value.trim());
    if (!callback.startsWith('/') || callback.startsWith('//') || callback.includes('\\')) {
      return null;
    }

    const parsed = new URL(callback, 'https://bareeq.local');
    if (parsed.origin !== 'https://bareeq.local') return null;

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
