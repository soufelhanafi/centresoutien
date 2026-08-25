import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The reasons `hub.enableHosting` can fail, each mapped to its own localized
 * message. `no-lan-interface` is main's `HubNoLanInterfaceError` — a plain error
 * (no domain envelope), so it is matched by its message rather than a stable code;
 * `plan-feature-unavailable` is the shared `sync.multi-device` gate. Anything else
 * falls through to `unknown`.
 */
export type HostingErrorCode = 'no-lan-interface' | 'plan-feature-unavailable' | 'unknown';

function errorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';
}

export function hostingErrorCode(error: unknown): HostingErrorCode {
  if (resolveDomainErrorCode(error) === 'plan-feature-unavailable') return 'plan-feature-unavailable';
  if (errorMessage(error).includes('no private LAN interface')) return 'no-lan-interface';
  return 'unknown';
}
