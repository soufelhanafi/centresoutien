import { bcp47 } from '../format';

/**
 * `Formula.priceMad` is stored as an integer number of MAD centimes (CLAUDE.md
 * §7 / `entities/formula.ts`), but a center director thinks and types in whole
 * MAD. These convert at the presentation boundary — the domain never sees a
 * MAD-unit number.
 */
export function centimesToMad(centimes: number): number {
  return centimes / 100;
}

export function madToCentimes(mad: number): number {
  return Math.round(mad * 100);
}

/** Locale-formatted MAD amount from an integer centimes value (CLAUDE.md §8). */
export function formatMad(centimes: number, locale: string): string {
  return new Intl.NumberFormat(bcp47(locale), { style: 'currency', currency: 'MAD' }).format(
    centimesToMad(centimes),
  );
}
