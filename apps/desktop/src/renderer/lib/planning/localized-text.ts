/** A bilingual `{ fr, ar }` label in the active locale (Arabic under `ar`, French otherwise). */
export function localizedText(text: { readonly fr: string; readonly ar: string }, locale: string): string {
  return locale === 'ar' ? text.ar : text.fr;
}
