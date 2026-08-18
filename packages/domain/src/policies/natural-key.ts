import type { CenterCode } from '../value-objects/ids';

// Unicode-property escapes keep the source ASCII while matching any script
// (Latin, Arabic, …). `\p{Mn}` = the combining marks NFKD leaves behind.
const COMBINING_MARKS = /\p{Mn}/gu;
const NON_NAME_CHARS = /[^\p{L}\p{N}\s]/gu; // keep letters + numbers + spacing
const CONTACT_NOISE = /[\s\-()]/g;
// A run of Arabic letters — a single "word" for the transliteration dictionary.
const ARABIC_WORD = /[\u0621-\u064a]+/g;
// Glue the Moroccan/Arabic definite article onto the following word ("El Amrani"
// / "Elamrani" / "Al Amrani" → one key), unifying the el-/al- forms. Scoped to a
// full word + whitespace so a given name like "Ala" is never touched.
const ARTICLE_FOLD = [/\bel\s+/g, /\bal\s+/g] as const;

/**
 * Curated Arabic → canonical-Moroccan-French-Latin dictionary for the highest-
 * frequency given names. This is the deliberate, narrow transliteration seam of
 * the duplicate matcher: an Arabic name in the table collides with its common
 * Latin spelling ("محمد" / "Mohamed" / "Mohammed" → `mohamed`), while any Arabic
 * word NOT in the table is kept verbatim — so distinct or rare names never
 * over-merge. Word-level, not per-letter: Arabic short vowels are unwritten, so a
 * generic consonant map would fabricate spellings ("محمد" → "mhmd") and over-merge
 * Latin pairs like Amine/Amina or Ali/Ala that share a consonant skeleton. The
 * table is additive; extend it with new names only when their French spelling is
 * standard enough to be unambiguous.
 */
const ARABIC_TO_LATIN_NAME_RAW: Readonly<Record<string, string>> = {
  'محمد': 'mohamed',
  'أحمد': 'ahmed',
  'فاطمة': 'fatima',
  'خديجة': 'khadija',
  'يوسف': 'youssef',
  'ياسين': 'yassine',
  'سلمى': 'salma',
  'كريم': 'karim',
  'حسن': 'hassan',
  'أمين': 'amine',
  'أمينة': 'amina',
};

/**
 * The lookup map is keyed on the same NFKD + combining-mark-strip + lowercase
 * form the matcher normalizes names to BEFORE the dictionary runs (M1): a key
 * like `أحمد` decomposes to `ا` + combining hamza (Mn), the mark strip removes
 * it, so the live word is `احمد`. Keying the map on that stripped form makes
 * the composed `أحمد` and the informal hamza-less `احمد` both hit their entry.
 */
const ARABIC_TO_LATIN_NAME = new Map(
  Object.entries(ARABIC_TO_LATIN_NAME_RAW).map(([key, latin]) => [
    key.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase(),
    latin,
  ]),
);

function transliterateArabicWords(name: string): string {
  return name.replace(ARABIC_WORD, (word) => ARABIC_TO_LATIN_NAME.get(word) ?? word);
}

/**
 * Curated canonical-Latin spelling variants, applied AFTER the name is
 * normalized and transliterated (M2). There is deliberately NO blanket
 * doubled-consonant fold — `Allami`/`Alami`, `Bennani`/`Benani`, `Allal`/`Alal`
 * are genuinely distinct Moroccan families and must never merge. Only the
 * unambiguous transliteration-table spellings get an entry, additive like the
 * Arabic dictionary; `mohammed → mohamed` preserves the Mohamed/Mohammed/محمد
 * collision that the table's `محمد` entry already buys.
 */
const LATIN_NAME_VARIANTS: Readonly<Record<string, string>> = {
  mohammed: 'mohamed',
};

function foldLatinNameVariants(name: string): string {
  return name
    .split(/\s+/)
    .map((token) => LATIN_NAME_VARIANTS[token] ?? token)
    .join(' ');
}

/**
 * The name slot of a `naturalKey` / sync match: NFKD-normalized, combining marks
 * stripped, lower-cased, punctuation removed, Arabic→Latin transliterated (via
 * the curated {@link ARABIC_TO_LATIN_NAME} table), the el-/al- article glued, and
 * the curated canonical-Latin variants folded, so "Mohamed", "Mohammed", and
 * "محمد" all produce the same key. Distinct names stay distinct — "Fatima" and
 * "Fatima-Zahra" never collapse, and geminated Moroccan surnames (`Allami` vs
 * `Alami`, `Bennani` vs `Benani`) are never folded. Exported so the
 * sync duplicate matcher runs the *exact* same normalization the write path
 * stamps (`sync-safe-entities`: a matcher that normalizes differently from the
 * saver can never collide).
 *
 * ⚠️ IMMUTABILITY NOTE (SOU-92): existing `naturalKey`s were stamped at creation
 * with the pre-transliteration normalization and are immutable — renaming a
 * person never rewrites their key. This function change therefore only affects
 * FUTURE keys (new records / new sync matches); existing rows are not migrated.
 */
export function normalizeNameForMatch(fullName: string): string {
  let name = fullName
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    // A hyphen is a token separator, not a letter: turn it into a space so the
    // pipeline is idempotent (a key we already hyphenate re-normalizes to itself).
    .replace(/-/g, ' ')
    .replace(NON_NAME_CHARS, '');
  name = transliterateArabicWords(name);
  for (const fold of ARTICLE_FOLD) name = name.replace(fold, 'el');
  name = foldLatinNameVariants(name);
  return name.trim().replace(/\s+/g, '-');
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
 * share one normalization. The name slot is the **FR name only** (SOU-271): AR is
 * now optional/empty for FR-only data entry, so it can no longer anchor matching —
 * same FR name + same birth date + same center is the collision rule. Stamped once
 * at creation and never recomputed, so sync matching stays stable.
 */
export function buildStudentNaturalKey(input: {
  centerCode: CenterCode;
  name: { fr: string; ar: string };
  birthDate: string;
}): string {
  return normalizeNaturalKey({
    centerCode: input.centerCode,
    fullName: input.name.fr,
    contact: input.birthDate,
  });
}

/**
 * Build a Teacher's `naturalKey`. Teachers are people-like and — like Parents —
 * anchored on the **E.164 phone** (already canonical from the {@link normalizePhone}
 * value object), so two teachers sharing a number but with different names get
 * different keys (both saved), while the same name + same phone collides (a
 * genuine duplicate). The name slot is the **FR name only** (SOU-271), exactly as
 * {@link buildStudentNaturalKey} does — AR is now optional/empty and can no longer
 * anchor matching. Stamped once at creation and never recomputed, so sync matching
 * stays stable.
 */
export function buildTeacherNaturalKey(input: {
  centerCode: CenterCode;
  name: { fr: string; ar: string };
  phone: string;
}): string {
  return normalizeNaturalKey({
    centerCode: input.centerCode,
    fullName: input.name.fr,
    contact: input.phone,
  });
}
