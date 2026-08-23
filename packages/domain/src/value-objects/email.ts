import type { Brand } from './brand';
import { DomainError } from '../errors/plan-errors';

/**
 * An email address normalized to a canonical form (trimmed + lower-cased).
 * Branded so a raw, unvalidated string can never be passed where a canonical
 * address is expected — every email crosses the domain boundary through
 * {@link normalizeEmail} first. Used only as an optional contact channel (e.g.
 * the owner's address for the password-reset-by-email relay); it is NOT a
 * duplicate-matching anchor (accounts match on username, not email).
 */
export type Email = Brand<string, 'Email'>;

/** Thrown when a raw email string is not a syntactically valid address. */
export class InvalidEmailError extends DomainError {
  // Stable machine code the IPC boundary carries so the renderer localizes via
  // `t('errors.invalid-email')` instead of surfacing the class name (SOU-273).
  readonly code = 'invalid-email';

  constructor(readonly raw: string) {
    super(`"${raw}" is not a valid email address.`);
  }
}

/** RFC 5321 caps the whole address at 254 chars; anything longer is rejected. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Pragmatic, RFC-ish address shape (the HTML5 `<input type="email">` grammar,
 * lower-cased): a local part, an `@`, and a dotted domain of labels. Deliberately
 * not a full RFC 5322 parser — that accepts forms no real mailbox uses. Anchored
 * so nothing shorter or longer slips through.
 */
const EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Normalize a raw, human-typed email to its canonical stored form (trim +
 * lower-case), or throw {@link InvalidEmailError}. Pure — no platform/library
 * dependency. Lower-casing is safe for matching and display here: mailbox local
 * parts are technically case-sensitive per RFC, but no real provider treats them
 * so, and a single canonical form keeps the stored value deterministic across a
 * center's synced laptops.
 */
export function normalizeEmail(raw: string): Email {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '' || trimmed.length > EMAIL_MAX_LENGTH || !EMAIL_REGEX.test(trimmed)) {
    throw new InvalidEmailError(raw);
  }
  return trimmed as Email;
}
