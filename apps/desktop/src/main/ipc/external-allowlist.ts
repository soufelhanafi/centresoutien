/**
 * The hosts `external.open` may hand to the OS browser (SOU-85). Kept as a pure,
 * Electron-free predicate so the security decision is unit-testable without the
 * shell. Only the landing page is reachable today; adding a host is an edit here.
 *
 * `https` is required (no `file:`, `javascript:`, or plain `http:`) and the host
 * is matched exactly against the set — a subdomain or look-alike is refused.
 */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['centresoutien.com', 'www.centresoutien.com']);

export function isAllowedExternalUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return ALLOWED_HOSTS.has(url.hostname.toLowerCase());
}
