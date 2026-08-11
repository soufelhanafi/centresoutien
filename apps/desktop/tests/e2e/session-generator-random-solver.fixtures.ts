import type { Page, Locator } from '@playwright/test';
import type { Locale } from './planning-sessions.fixtures';

/**
 * SOU-182 — "Planification aléatoire" (auto session generator) must search ALL
 * weekday combinations that respect the min-gap constraint before it ever
 * reports a conflict, keeping the first conflict-free candidate. It may only
 * surface a conflict when NO valid combination is conflict-free (true dead-end).
 *
 * Black-box only: driven through the running packaged app. Two seams, both
 * public and both what the real dialog uses:
 *   - the `session.generator.preview` IPC channel (the exact call the "Aperçu"
 *     button fires) — used for the precise, deterministic day-set assertions;
 *   - the actual Auto-mode dialog UI — used to prove the visible warning-badge
 *     contract (banner shown only on a dead-end) and RTL.
 *
 * All copy mirrored from the running UI / i18n catalog (planning.generator.*).
 */

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export type GeneratedBlock = { dayOfWeek: number; start: string; end: string; roomId: string };
export type PreviewResult = {
  proposals: { groupId: string; blocks: GeneratedBlock[]; gapViolations: unknown[] }[];
  conflicts: { kind: 'room' | 'hours'; groupId: string; dayOfWeek: number }[];
};

/**
 * A banner-unique substring of the preview's non-blocking "conflicts detected"
 * banner, per locale — deliberately NOT the bare word "conflict", which also
 * appears in each per-block conflict chip and would match multiple elements
 * (strict-mode violation). The FR "détecté(s)" phrasing and the AR
 * "verify before generating" tail occur only in the banner itself.
 */
export const CONFLICT_BANNER_RE: Record<Locale, RegExp> = {
  fr: /conflit\(s\) détecté\(s\)/,
  ar: /تحقق قبل التوليد/,
};

export const SOLVER_STR: Record<Locale, { minGapLabel: string; sessionsPerWeekLabel: string }> = {
  fr: { minGapLabel: 'Écart minimum (jours)', sessionsPerWeekLabel: 'Séances par semaine' },
  ar: { minGapLabel: 'الحد الأدنى للفارق (أيام)', sessionsPerWeekLabel: 'الحصص في الأسبوع' },
};

/**
 * Fire the auto generator's dry-run preview through the public IPC channel the
 * dialog's "Aperçu" button uses. `conflicts.length === 0` is exactly the
 * "no warning badge" state; a non-empty `conflicts` is the surfaced dead-end.
 */
export async function previewAuto(
  win: Page,
  groupId: string,
  opts: { weekdayPool: number[]; minGapDays: number; sessionsPerWeek: number; durationMinutes?: number },
): Promise<PreviewResult> {
  return win.evaluate(async (args) => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('session.generator.preview', {
      mode: 'auto',
      scope: { groups: [args.groupId], teachers: 'all' },
      kind: 'regular',
      weekdayPool: args.opts.weekdayPool,
      sessionsPerWeek: args.opts.sessionsPerWeek,
      minGapDays: args.opts.minGapDays,
      sessionDurationMinutes: args.opts.durationMinutes ?? 90,
      range: { startDate: '2026-08-10', endDate: '2026-08-31' },
    }) as Promise<unknown>;
  }, { groupId, opts }) as Promise<PreviewResult>;
}

/** Sorted, de-duplicated day-of-week set of the single group's proposed blocks. */
export function proposalDays(result: PreviewResult): number[] {
  const first = result.proposals[0];
  if (!first) return [];
  return [...new Set(first.blocks.map((b) => b.dayOfWeek))].sort((a, b) => a - b);
}

/** Read a number input inside the dialog by its `name` and overwrite it. */
export async function setNumberField(dialog: Locator, name: string, value: number): Promise<void> {
  const input = dialog.locator(`input[name="${name}"]`);
  await input.fill(String(value));
}
