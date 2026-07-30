import type { CenterCode } from '../value-objects/ids';

// Unicode ranges kept as escapes (never literal combining chars in source):
// U+0300–U+036F combining diacritics; U+0621–U+064A the Arabic letters block.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;
// Anything that is not a Latin letter, digit, or Arabic letter — spaces,
// hyphens, and punctuation are all removed so separator variants collapse.
const NON_NAME_CHARS = /[^a-z0-9ء-ي]/g;

/**
 * Normalize a person's name for duplicate matching: strip diacritics, lowercase,
 * and drop every separator and punctuation mark, keeping only Latin letters,
 * digits, and the Arabic block. This makes "El Amrani" / "Elamrani" / "el-amrani"
 * collide and keeps Arabic letters intact ("محمد" stays "محمد"). Pure — no
 * platform or library dependency.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(NON_NAME_CHARS, '');
}

/**
 * Build a Student's `naturalKey`: `centerCode :: normalizedName :: birthDate`.
 * The birth date is the discriminator that survives without a linked parent (the
 * Parent entity lands in SOU-40) — two children sharing a normalized name but a
 * different birth date get different keys. Stamped once at creation and never
 * recomputed, so sync matching stays deterministic.
 */
export function buildStudentNaturalKey(input: {
  centerCode: CenterCode;
  name: { fr: string; ar: string };
  birthDate: string;
}): string {
  const name = `${normalizeName(input.name.fr)}-${normalizeName(input.name.ar)}`;
  return `${input.centerCode}::${name}::${input.birthDate}`;
}
