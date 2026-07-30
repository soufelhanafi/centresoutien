import type { CenterCode } from '../value-objects/ids';

// Unicode-property escapes keep the source ASCII while matching any script
// (Latin, Arabic, …). `\p{Mn}` = the combining marks NFKD leaves behind.
const COMBINING_MARKS = /\p{Mn}/gu;
const NON_NAME_CHARS = /[^\p{L}\p{N}\s]/gu; // keep letters + numbers + spacing
const CONTACT_NOISE = /[\s\-()]/g;

/**
 * Builds the `naturalKey` for a people-like entity — the fast exact-match tier of
 * the parents-first duplicate-matching hierarchy (`sync-safe-entities`). It is a
 * *matching key*, never a hard constraint: stamped once at creation, immutable
 * thereafter (renaming a person must NOT change their key, or sync merges become
 * unreliable), and scoped to a single center (the tenant never crosses).
 *
 * Shape: `{centerCode}::{normalized name}::{normalized contact}`. The name is
 * diacritic-stripped, lower-cased, and punctuation-collapsed; Latin and Arabic
 * letters are both preserved. The contact is the duplicate anchor — for parents
 * this is the E.164 phone (already canonical from the {@link normalizePhone}
 * value object), which is why two guardians sharing a family phone but with
 * different names produce *different* keys (both saved), while the same name +
 * same phone collides (a genuine duplicate).
 */
export function normalizeNaturalKey(input: {
  centerCode: CenterCode;
  fullName: string;
  contact: string;
}): string {
  const name = input.fullName
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_NAME_CHARS, '')
    .trim()
    .replace(/\s+/g, '-');
  const contact = input.contact.replace(CONTACT_NOISE, '').toLowerCase();
  return `${input.centerCode}::${name}::${contact}`;
}
