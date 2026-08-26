/** Kept in sync with the renderer's `LOCALES` (`apps/desktop/src/renderer/i18n/direction.ts`).
 * Duplicated rather than imported: this file must stay import-free of the
 * renderer (clean-architecture §forbidden imports), same as
 * `infra/locale-preference-store.ts`. */
export type MenuLocale = 'fr' | 'ar';

export type MenuLabels = {
  view: string;
  reload: string;
  forceReload: string;
};

const LABELS: Record<MenuLocale, MenuLabels> = {
  fr: { view: 'Affichage', reload: 'Recharger', forceReload: 'Forcer le rechargement' },
  ar: { view: 'عرض', reload: 'إعادة التحميل', forceReload: 'فرض إعادة التحميل' },
};

export function menuLabelsFor(locale: string | undefined): MenuLabels {
  return locale === 'ar' ? LABELS.ar : LABELS.fr;
}
