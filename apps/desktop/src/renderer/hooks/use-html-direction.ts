import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { directionForLocale } from '../i18n/direction';

/**
 * Keep `<html lang dir>` in sync with the active locale, live. RTL is driven by
 * a single `dir="rtl"` on the root (CLAUDE.md §8) — never per-component flips.
 */
export function useHtmlDirection(): void {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', locale);
    root.setAttribute('dir', directionForLocale(locale));
  }, [locale]);
}
