import type { CenterCode } from '../value-objects/ids';

// Unicode-property escapes keep the source ASCII while matching any script
// (Latin, Arabic, …). `\p{Mn}` = the combining marks NFKD leaves behind.
const COMBINING_MARKS = /\p{Mn}/gu;
const NON_NAME_CHARS = /[^\p{L}\p{N}\s]/gu; // keep letters + numbers + spacing
const CONTACT_NOISE = /[\s\-()]/g;

/**
 * The name slot of a `naturalKey` / sync match: diacritic-stripped (NFKD +
 * `\p{Mn}`), lower-cased, punctuation-collapsed, whitespace → `-`. Latin and
 * Arabic letters are both preserved, so "Mohamed" / "Mohammed" / "محمد" normalize
 * onto one key. Exported so the sync duplicate matcher runs the *exact* same
 * normalization the write path stamps (`sync-safe-entities`: a matcher that
 * normalizes differently from the saver can never collide).
 */
export function normalizeNameForMatch(fullName: string): string {
  return fullName
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_NAME_CHARS, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Builds the `naturalKey` for a people-like entity — the fast exact-match tier of
 * the parents-first duplicate-matching hierarchy (`sync-safe-entities`). It is a
 * *matching key*, never a hard constraint: stamped once at creation, immutable
 * thereafter (renaming a person must NOT change their key, or sync merges become
 * unreliable), and scoped to a single center (the tenant never crosses).
 *
 * Shape: `{centerCode}::{normalized name}::{normalized contact}`. The contact is
 * the duplicate anchor — for parents this is the E.164 phone (already canonical
 * from the {@link normalizePhone} value object), which is why two guardians
 * sharing a family phone but with different names produce *different* keys (both
 * saved), while the same name + same phone collides (a genuine duplicate).
 */
export function normalizeNaturalKey(input: {
  centerCode: CenterCode;
  fullName: string;
  contact: string;
}): string {
  const name = normalizeNameForMatch(input.fullName);
  const contact = input.contact.replace(CONTACT_NOISE, '').toLowerCase();
  return `${input.centerCode}::${name}::${contact}`;
}

/**
 * Build a Student's `naturalKey`. Students are people-like but have no phone; the
 * duplicate anchor is the **birth date** (until parent-linked matching lands in
 * SOU-92) — two children sharing a normalized name but a different birth date get
 * different keys. Delegates to {@link normalizeNaturalKey} so students and parents
 * share one normalization, with the FR + AR names combined into the name slot.
 * Stamped once at creation and never recomputed, so sync matching stays stable.
 */
export function buildStudentNaturalKey(input: {
  centerCode: CenterCode;
  name: { fr: string; ar: string };
  birthDate: string;
}): string {
  return normalizeNaturalKey({
    centerCode: input.centerCode,
    fullName: `${input.name.fr} ${input.name.ar}`,
    contact: input.birthDate,
  });
}

/**
 * Build a Teacher's `naturalKey`. Teachers are people-like and — like Parents —
 * anchored on the **E.164 phone** (already canonical from the {@link normalizePhone}
 * value object), so two teachers sharing a number but with different names get
 * different keys (both saved), while the same name + same phone collides (a
 * genuine duplicate). The bilingual FR + AR names are combined into the name slot,
 * exactly as {@link buildStudentNaturalKey} does. Stamped once at creation and
 * never recomputed, so sync matching stays stable.
 */
export function buildTeacherNaturalKey(input: {
  centerCode: CenterCode;
  name: { fr: string; ar: string };
  phone: string;
}): string {
  return normalizeNaturalKey({
    centerCode: input.centerCode,
    fullName: `${input.name.fr} ${input.name.ar}`,
    contact: input.phone,
  });
}
