import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr.json';
import ar from './ar.json';
import { DEFAULT_LOCALE } from './direction';

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    ar: { translation: ar },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
