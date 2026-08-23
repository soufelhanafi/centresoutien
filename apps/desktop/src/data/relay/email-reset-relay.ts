// The desktop UI locale carried to the relay so the emailed code arrives in the
// language the owner is reading (SOU-273). Matches the landing relay's accepted set.
export type EmailResetLocale = 'fr' | 'ar';

export type EmailResetRequestInput = {
  readonly email: string;
  readonly accountId: string;
  readonly centerCode: string;
  readonly locale: EmailResetLocale;
};

export type EmailResetConfirmInput = {
  readonly email: string;
  readonly accountId: string;
  readonly code: string;
};

// The relay never reveals whether an account exists, so a request that reached the
// relay is always `sent`. `rate-limited` is the relay's throttle; `unreachable` is
// the offline branch the UI turns into "no connection — use a recovery code".
export type EmailResetRequestOutcome = 'sent' | 'rate-limited' | 'unreachable';

// `invalid-or-expired` is the relay's single generic failure for a wrong, expired,
// unknown, or already-used code — deliberately not distinguished, matching the
// relay endpoint that never leaks which check failed.
export type EmailResetConfirmOutcome =
  | 'confirmed'
  | 'invalid-or-expired'
  | 'rate-limited'
  | 'unreachable';

/**
 * The desktop's client for the online password-reset relay (the landing site's
 * `/api/auth/reset-request` + `/api/auth/reset-confirm`, SOU-157/SOU-273). It only
 * proves control of the owner's mailbox — it never sees or sets the password. The
 * main IPC handler owns the flow: it calls `requestReset`, then later `confirmReset`,
 * and only on `confirmed` runs the LOCAL password reset. The interface lives in the
 * data layer (infra I/O); the handler receives it via injected deps and can mock it.
 */
export interface EmailResetRelay {
  requestReset(input: EmailResetRequestInput): Promise<EmailResetRequestOutcome>;
  confirmReset(input: EmailResetConfirmInput): Promise<EmailResetConfirmOutcome>;
}
