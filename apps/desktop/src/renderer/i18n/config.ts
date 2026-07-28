import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr.json';
import ar from './ar.json';
import { DEFAULT_LOCALE, LOCALES } from './direction';

/** Initial locale from the `?locale=` query (set by the main process), else FR. */
function initialLocale(): string {
  if (typeof window !== 'undefined' && window.location.search) {
    const requested = new URLSearchParams(window.location.search).get('locale');
    if (requested && (LOCALES as readonly string[]).includes(requested)) return requested;
  }
  return DEFAULT_LOCALE;
}

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    ar: { translation: ar },
  },
  lng: initialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
