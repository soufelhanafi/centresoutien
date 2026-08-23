import type {
  EmailResetConfirmInput,
  EmailResetConfirmOutcome,
  EmailResetRelay,
  EmailResetRequestInput,
  EmailResetRequestOutcome,
} from './email-reset-relay';

// The relay is a plain internet POST, so a longer offline wait than the LAN hub is
// pointless — a mistyped/absent connection should fall back to the recovery-code
// path quickly rather than freeze the reset screen.
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * HTTP adapter for {@link EmailResetRelay} (SOU-273), modeled on
 * {@link import('../sync/http-sync-hub-client').HttpSyncHubClient}: constructor-
 * injected `baseUrl` + `fetchImpl`, an `AbortController` timeout, and a network
 * failure or timeout mapped to the `unreachable` outcome the UI turns into an
 * offline hint. The relay's own responses (200 generic-ok, 429 rate-limited, and —
 * for confirm — 400 invalid-or-expired) map to the typed outcomes; any other
 * non-2xx is treated as `unreachable` so a transient relay fault never presents as
 * a wrong code.
 */
export class HttpEmailResetRelay implements EmailResetRelay {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: { baseUrl: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async requestReset(input: EmailResetRequestInput): Promise<EmailResetRequestOutcome> {
    const response = await this.post('/api/auth/reset-request', {
      email: input.email,
      accountId: input.accountId,
      centerCode: input.centerCode,
      locale: input.locale,
    });
    if (response === 'unreachable') return 'unreachable';
    if (response.status === 429) return 'rate-limited';
    if (response.ok) return 'sent';
    return 'unreachable';
  }

  async confirmReset(input: EmailResetConfirmInput): Promise<EmailResetConfirmOutcome> {
    const response = await this.post('/api/auth/reset-confirm', {
      email: input.email,
      accountId: input.accountId,
      code: input.code,
    });
    if (response === 'unreachable') return 'unreachable';
    if (response.status === 429) return 'rate-limited';
    if (response.ok) return 'confirmed';
    if (response.status === 400) return 'invalid-or-expired';
    return 'unreachable';
  }

  private async post(path: string, body: unknown): Promise<Response | 'unreachable'> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      return 'unreachable';
    } finally {
      clearTimeout(timeout);
    }
  }
}
