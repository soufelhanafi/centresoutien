import type { Locator, Page } from '@playwright/test';
import { STR as PLANNING_STR, type Locale } from './planning-sessions.fixtures';

/**
 * SOU-159 — "Générer des séances" popup on the weekly planner toolbar.
 *
 * Black-box only: driven through the running packaged app. Copy is mirrored
 * from `i18n/fr.json` / `ar.json` (`planning.generator.*`), read directly off
 * the running UI once the FormLabel-outside-FormField crash was fixed
 * (commit f0ac6f6) so the dialog's internal config → preview flow could
 * actually be exercised.
 */

export const GENERATOR_STR: Record<
  Locale,
  {
    trigger: string;
    title: string;
    previewAction: string;
    back: string;
    commitAction: string;
    commitSuccess: string;
    commitSkipped: string;
    mode: { label: string; auto: string; custom: string };
    weekdayPoolGroupLabel: string;
    pickedWeekdaysGroupLabel: string;
    range: { startDateLabel: string; endDateLabel: string };
    preview: { conflictsBanner: string };
    warnings: { room: string };
  }
> = {
  fr: {
    trigger: 'Générer',
    title: 'Générer des séances',
    previewAction: 'Aperçu',
    back: 'Retour',
    commitAction: 'Générer les séances',
    commitSuccess: '{{count}} créneau(x) récurrent(s) créé(s).',
    commitSkipped: '{{count}} date(s) ignorée(s) car jour férié.',
    mode: { label: 'Mode', auto: 'Automatique', custom: 'Manuel' },
    weekdayPoolGroupLabel: 'Jours éligibles',
    pickedWeekdaysGroupLabel: 'Jours choisis',
    range: { startDateLabel: 'Date de début', endDateLabel: 'Date de fin' },
    preview: { conflictsBanner: '{{count}} conflit(s) détecté(s). Vérifiez avant de générer.' },
    warnings: { room: 'Salle {{room}} déjà occupée le {{day}}.' },
  },
  ar: {
    trigger: 'توليد',
    title: 'توليد الحصص',
    previewAction: 'معاينة',
    back: 'رجوع',
    commitAction: 'توليد الحصص',
    commitSuccess: 'تم إنشاء {{count}} موعد متكرر.',
    commitSkipped: 'تم تجاهل {{count}} تاريخ بسبب العطلة.',
    mode: { label: 'الوضع', auto: 'تلقائي', custom: 'يدوي' },
    weekdayPoolGroupLabel: 'الأيام المتاحة',
    pickedWeekdaysGroupLabel: 'الأيام المختارة',
    range: { startDateLabel: 'تاريخ البداية', endDateLabel: 'تاريخ النهاية' },
    preview: { conflictsBanner: 'تم رصد {{count}} تعارض. تحقق قبل التوليد.' },
    warnings: { room: 'القاعة {{room}} مشغولة يوم {{day}}.' },
  },
};

export const STR = PLANNING_STR;

/** Renderer error-boundary text observed when a screen crashes (fr/ar). */
const CRASH_MARKERS = [
  'Une erreur est survenue',
  'Impossible d’afficher cet écran',
  "Impossible d'afficher cet écran",
  'حدث خطأ',
  'تعذر عرض هذه الشاشة',
];

export async function isShowingCrashBoundary(win: Page): Promise<boolean> {
  const text = await win.evaluate(() => document.body.innerText);
  return CRASH_MARKERS.some((marker) => text.includes(marker));
}

/**
 * Clicks the "Générer" toolbar trigger and waits briefly for either the
 * dialog or the renderer error boundary to appear. Returns which one showed
 * up so specs can assert precisely instead of hanging on the default
 * per-assertion timeout.
 */
export async function openGenerator(
  win: Page,
  locale: Locale,
): Promise<'dialog' | 'crashed' | 'neither'> {
  await win.getByRole('button', { name: GENERATOR_STR[locale].trigger, exact: true }).click();
  await win.waitForTimeout(700);

  if (await isShowingCrashBoundary(win)) return 'crashed';
  const dialogVisible = await win
    .getByRole('dialog')
    .isVisible()
    .catch(() => false);
  return dialogVisible ? 'dialog' : 'neither';
}

/** Switches the config-form Mode toggle ("Automatique"/"Manuel" — "تلقائي"/"يدوي"). */
export async function switchGeneratorMode(dialog: Locator, L: (typeof GENERATOR_STR)[Locale], mode: 'auto' | 'custom'): Promise<void> {
  const label = mode === 'auto' ? L.mode.auto : L.mode.custom;
  await dialog.getByRole('group', { name: L.mode.label }).getByRole('button', { name: label, exact: true }).click();
}

/** Toggles one weekday pill within either the eligible-days or picked-days button group. */
export async function toggleWeekdayButton(
  dialog: Locator,
  groupLabel: string,
  weekdayName: string,
): Promise<void> {
  await dialog.getByRole('group', { name: groupLabel }).getByRole('button', { name: weekdayName, exact: true }).click();
}

/** Fills the "Dates" range inputs (HTML `type="date"` — always ISO `YYYY-MM-DD`, locale-independent). */
export async function fillGeneratorDateRange(dialog: Locator, startDate: string, endDate: string): Promise<void> {
  await dialog.locator('input[name="startDate"]').fill(startDate);
  await dialog.locator('input[name="endDate"]').fill(endDate);
}

/** Submits the config step ("Aperçu"/"معاينة") and waits for the preview step to render. */
export async function submitGeneratorConfig(dialog: Locator, L: (typeof GENERATOR_STR)[Locale]): Promise<void> {
  await dialog.getByRole('button', { name: L.previewAction, exact: true }).click();
  await dialog.getByRole('button', { name: L.commitAction, exact: true }).waitFor();
}

/**
 * The dialog's built-in icon-only close ("X") button — located by its lucide
 * icon class rather than its accessible name, since that name is
 * locale-independent by design in shadcn's `DialogContent` (the `closeLabel`
 * prop) but the generator dialog does not pass one (see AC7 findings).
 */
export function generatorCloseButton(dialog: Locator): Locator {
  return dialog.locator('button:has(svg.lucide-x)');
}
