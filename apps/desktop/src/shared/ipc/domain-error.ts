/**
 * Cross-process transport for a domain error's stable `code`.
 *
 * Electron flattens a thrown handler error on the way back to the renderer: the
 * rejected value is a plain `Error` whose `name` is `"Error"`, whose custom
 * own-properties (a `DomainError`'s `code`) are dropped, and only `message` /
 * `stack` survive. So the machine `code` cannot be read directly across
 * `ipcRenderer.invoke`. The main dispatcher therefore encodes the code (plus the
 * human message) into the thrown error's message between sentinels, and the
 * preload `invoke` wrapper decodes it and re-attaches `code` to the rejection.
 * Every channel benefits; the renderer maps `code` to a localized message with no
 * per-channel plumbing.
 */
const SENTINEL = '@@CS_DOMAIN_ERROR@@';

export type DomainErrorPayload = { readonly code: string; readonly message: string };

/** Encode a domain error's code + human message into one transportable string. */
export function encodeDomainError(payload: DomainErrorPayload): string {
  return `${SENTINEL}${JSON.stringify(payload)}${SENTINEL}`;
}

/**
 * Extract a {@link DomainErrorPayload} from a (possibly Electron-prefixed) error
 * message, or `null` when the message carries no domain envelope. Tolerates the
 * `"Error invoking remote method '…': Error: "` prefix Electron prepends by
 * scanning for the sentinels rather than matching the whole string.
 */
export function decodeDomainError(message: string): DomainErrorPayload | null {
  const start = message.indexOf(SENTINEL);
  if (start === -1) return null;
  const end = message.indexOf(SENTINEL, start + SENTINEL.length);
  if (end === -1) return null;
  try {
    const parsed: unknown = JSON.parse(message.slice(start + SENTINEL.length, end));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { code?: unknown }).code === 'string' &&
      typeof (parsed as { message?: unknown }).message === 'string'
    ) {
      return parsed as DomainErrorPayload;
    }
    return null;
  } catch {
    return null;
  }
}
