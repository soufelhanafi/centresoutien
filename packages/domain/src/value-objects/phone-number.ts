import type { Brand } from './brand';
import { DomainError } from '../errors/plan-errors';

/**
 * A phone number normalized to E.164 (`+212612345678`). Branded so a raw,
 * unnormalized string can never be passed where a canonical number is expected —
 * every phone crosses the domain boundary through {@link normalizePhone} first.
 * E.164 is the sync duplicate-matching anchor (parents-first), so the stored form
 * must be canonical regardless of how a director typed it.
 */
export type PhoneNumber = Brand<string, 'PhoneNumber'>;

/** Thrown when a raw phone string cannot be normalized to a valid E.164 number. */
export class InvalidPhoneNumberError extends DomainError {
  constructor(readonly raw: string) {
    super(`"${raw}" is not a valid phone number.`);
  }
}

/** Only Morocco is supported today; the signature keeps room for more regions later. */
export type PhoneRegion = 'MA';

const MA_COUNTRY_CODE = '212';
/**
 * Moroccan national significant number: 9 digits whose leading digit is 5
 * (landline) or 6/7 (mobile). Anchored so nothing shorter or longer slips through.
 */
const MA_NATIONAL_NUMBER = /^[567]\d{8}$/;

/**
 * Normalize a raw, human-typed phone string to E.164, or throw
 * {@link InvalidPhoneNumberError}. Pure — no platform/library dependency (a
 * focused Moroccan-first normalizer, not a global libphonenumber). Accepts the
 * forms a director actually types: `0612345678`, `06 12 34 56 78`,
 * `0522-000000`, `+212612345678`, `00212612345678`, `212612345678`.
 */
export function normalizePhone(raw: string, region: PhoneRegion = 'MA'): PhoneNumber {
  void region; // only 'MA' exists today; kept explicit for the future signature
  const trimmed = raw.trim();
  if (trimmed === '') throw new InvalidPhoneNumberError(raw);

  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  let national: string;
  if (hadPlus) {
    // A leading + means the country code is explicit; only +212 is supported.
    if (!digits.startsWith(MA_COUNTRY_CODE)) throw new InvalidPhoneNumberError(raw);
    national = digits.slice(MA_COUNTRY_CODE.length);
  } else if (digits.startsWith(`00${MA_COUNTRY_CODE}`)) {
    national = digits.slice(`00${MA_COUNTRY_CODE}`.length);
  } else if (digits.startsWith(MA_COUNTRY_CODE) && digits.length === MA_COUNTRY_CODE.length + 9) {
    national = digits.slice(MA_COUNTRY_CODE.length);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  if (!MA_NATIONAL_NUMBER.test(national)) throw new InvalidPhoneNumberError(raw);
  return `+${MA_COUNTRY_CODE}${national}` as PhoneNumber;
}
