import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Kept in sync with the renderer's `LOCALES` (`apps/desktop/src/renderer/i18n/direction.ts`).
 * Duplicated rather than imported: this file must stay import-free of the
 * renderer (clean-architecture §forbidden imports). */
export const LOCALE_PREFERENCES = ['fr', 'ar'] as const;
export type LocalePreference = (typeof LOCALE_PREFERENCES)[number];

const FILE_NAME = 'preferences.json';

function isLocalePreference(value: unknown): value is LocalePreference {
  return (LOCALE_PREFERENCES as readonly unknown[]).includes(value);
}

/**
 * Unencrypted main-process preference file for the UI locale (SOU-31). Lives
 * directly under Electron's `userData` directory — deliberately NOT inside the
 * per-center SQLCipher database, because the locale must be readable before any
 * center is even selected (e.g. at the login screen). Not a domain port: unlike
 * `LogoStore`, there is no portable business rule here and no future web
 * adapter sharing this contract — a browser client would resolve locale from
 * `Accept-Language` or a session cookie instead, not from a `userData` file.
 *
 * `read` is synchronous by design — a single small `readFileSync`, cheap enough
 * to call on every window navigation (initial open, reload, re-`activate`) with
 * no async gap to await, so none of those paths can serve a locale that's gone
 * stale since app launch.
 */
export class LocalePreferenceStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, FILE_NAME);
  }

  read(): LocalePreference | null {
    if (!existsSync(this.filePath)) return null;
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      const locale = (parsed as { locale?: unknown } | null)?.locale;
      return isLocalePreference(locale) ? locale : null;
    } catch {
      // Missing, unreadable, or corrupted file — fall back to the default locale.
      return null;
    }
  }

  write(locale: LocalePreference): void {
    mkdirSync(this.userDataDir, { recursive: true });
    // Write-then-rename: a crash mid-write can only strand the .tmp file, never
    // truncate preferences.json itself — rename is atomic on the same filesystem.
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify({ locale }));
    renameSync(tmpPath, this.filePath);
  }
}
