import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { directionForLocale } from '../i18n/direction';

/**
 * Keep `<html lang dir>` in sync with the active locale, live. RTL is driven by
 * a single `dir="rtl"` on the root (CLAUDE.md §8) — never per-component flips.
 *
 * Also returns the current direction so callers can feed it to Radix's
 * `DirectionProvider`. Radix resolves direction via `useDirection`, which reads
 * a React context and otherwise falls back to the literal `'ltr'` — it never
 * consults `document.dir` or inherited CSS. Without the provider, portaled
 * Radix content (e.g. Select's listbox, appended to `<body>`) would render
 * `dir="ltr"` regardless of the active locale, breaking RTL. The `<html>`
 * attribute side effect below remains the single source of truth for RTL
 * per CLAUDE.md §8; `DirectionProvider` is additional, for Radix's benefit only.
 */
export function useHtmlDirection(): 'ltr' | 'rtl' {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const direction = directionForLocale(locale);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', locale);
    root.setAttribute('dir', direction);
  }, [locale, direction]);

  return direction;
}
