import type { Page, Locator } from '@playwright/test';
import type { Locale } from './planning-sessions.fixtures';

/**
 * SOU-275 — Custom-mode session generator + seat capacity.
 *
 * Black-box only: driven through the running packaged app via the public preload
 * bridge (`window.api.invoke`) and the real generator dialog. No renderer /
 * domain / data implementation is imported. Every string asserted on is mirrored
 * from the running i18n catalog (`planning.generator.preview.warnings.capacity`
 * and `planning.generator.preview.conflictAction.capacityBlockedHint`).
 *
 * SOU-272 fixed AUTO mode (hard fail when a group outgrows every room). SOU-275
 * handles CUSTOM mode: the undersized-room block is surfaced on the preview as a
 * NON-BLOCKING, NON-FORCEABLE "capacity" conflict, and commit is refused for it
 * with the stable IPC error code `schedule-capacity-conflict`.
 */

// The preload bridge (`window.api`) is injected at runtime and has no ambient type
// inside Playwright's `page.evaluate` browser sandbox, so each call site casts `window`
// through `unknown` to reach it. Narrowed to just `invoke` — the only channel these tests use.
type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export type GeneratedBlock = { dayOfWeek: number; start: string; end: string; roomId: string; teacherId: string | null };

export type CapacityConflict = {
  kind: 'capacity';
  groupId: string;
  roomId: string;
  dayOfWeek: number;
  start: string;
  end: string;
  groupCapacity: number;
  roomCapacity: number;
};

export type AnyConflict = { kind: string; groupId: string; roomId?: string; dayOfWeek: number };

export type PreviewResult = {
  proposals: { groupId: string; blocks: GeneratedBlock[]; gapViolations: unknown[] }[];
  conflicts: AnyConflict[];
};

/** The stable, IPC-safe domain error code SOU-275 pins for a non-forceable seat overflow at commit. */
export const CAPACITY_COMMIT_ERROR_CODE = 'schedule-capacity-conflict';
/** The auto-mode fast-fail code (SOU-272 regression) surfaced on preview. */
export const AUTO_CAPACITY_ERROR_CODE = 'group-exceeds-room-capacity';

/**
 * The localized capacity-warning contract, mirrored key-for-key from
 * `i18n/{fr,ar}.json` → `planning.generator.preview.warnings.capacity` and
 * `...conflictAction.capacityBlockedHint`. `keyword` is a locale-unique
 * substring proving the string is a REAL localized message (not a raw i18n key
 * like `planning.generator...capacity`).
 */
export const CAPACITY_STR: Record<
  Locale,
  {
    keyword: RegExp;
    warning: (room: string, groupCapacity: number, roomCapacity: number) => string;
    blockedHint: string;
    rawKeyLeak: RegExp;
  }
> = {
  fr: {
    keyword: /trop petite/,
    warning: (room, groupCapacity, roomCapacity) =>
      `Salle ${room} trop petite : ${groupCapacity} élèves pour ${roomCapacity} places.`,
    blockedHint:
      "Une salle est trop petite pour son groupe. Un dépassement de capacité ne peut pas être forcé : corrigez la salle ou la configuration, puis relancez l'aperçu.",
    rawKeyLeak: /planning\.generator/,
  },
  ar: {
    keyword: /صغيرة جدًا/,
    warning: (room, groupCapacity, roomCapacity) =>
      `القاعة ${room} صغيرة جدًا: ${groupCapacity} تلميذًا مقابل ${roomCapacity} مقعدًا.`,
    blockedHint:
      'توجد قاعة أصغر من أن تتّسع لمجموعتها. لا يمكن فرض تجاوز السعة: صحّح القاعة أو الإعدادات ثم أعد المعاينة.',
    rawKeyLeak: /planning\.generator/,
  },
};

/** Fire the CUSTOM generator preview through the public IPC channel the dialog's "Aperçu" button uses. */
export async function previewCustom(
  win: Page,
  groupId: string,
  opts: { pickedWeekdays: number[]; sessionDurationMinutes?: number },
): Promise<PreviewResult> {
  return win.evaluate(async (args) => {
    // untyped preload bridge in the evaluate sandbox — see Bridge
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('session.generator.preview', {
      mode: 'custom',
      scope: { groups: [args.groupId], teachers: 'all' },
      kind: 'regular',
      weekdayPool: [0, 1, 2, 3, 4, 5, 6],
      pickedWeekdays: args.opts.pickedWeekdays,
      sessionsPerWeek: args.opts.pickedWeekdays.length,
      minGapDays: 0,
      sessionDurationMinutes: args.opts.sessionDurationMinutes ?? 90,
      range: { startDate: '2026-08-10', endDate: '2026-08-31' },
    }) as Promise<unknown>;
  }, { groupId, opts }) as Promise<PreviewResult>;
}

/**
 * Echo a preview's proposals back into `session.generator.commit`, capturing a
 * rejection instead of letting it throw so the spec can assert on the stable
 * `code` (the only thing that survives IPC — the message is stripped). Sets
 * `allowScheduleConflict: true` on every block to prove even an explicit force
 * attempt cannot push a capacity block through.
 */
export async function commitProposalsExpectingError(
  win: Page,
  proposals: PreviewResult['proposals'],
): Promise<{ code: string | null; raw: string }> {
  return win.evaluate(
    async (props) => {
      // untyped preload bridge in the evaluate sandbox — see Bridge
      const api = (window as unknown as { api: Bridge }).api;
      const request = {
        mode: 'custom' as const,
        proposals: props.map((p) => ({
          groupId: p.groupId,
          blocks: p.blocks.map((b) => ({
            dayOfWeek: b.dayOfWeek,
            start: b.start,
            end: b.end,
            roomId: b.roomId,
            allowScheduleConflict: true,
          })),
        })),
        range: { startDate: '2026-08-10', endDate: '2026-08-31' },
      };
      try {
        await api.invoke('session.generator.commit', request);
        return { code: null, raw: 'no-error' };
      } catch (e) {
        const raw = String(e);
        const match = /@@CS_DOMAIN_ERROR@@(.*?)@@CS_DOMAIN_ERROR@@/.exec(raw);
        const code = match ? (JSON.parse(match[1]) as { code: string }).code : null;
        return { code, raw };
      }
    },
    proposals,
  ) as Promise<{ code: string | null; raw: string }>;
}

/** Commit a clean preview through the public channel and return the created templates (sanity path). */
export async function commitProposals(
  win: Page,
  proposals: PreviewResult['proposals'],
): Promise<{ templates: unknown[] }> {
  return win.evaluate(async (props) => {
    // untyped preload bridge in the evaluate sandbox — see Bridge
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('session.generator.commit', {
      mode: 'custom',
      proposals: props.map((p) => ({
        groupId: p.groupId,
        blocks: p.blocks.map((b) => ({ dayOfWeek: b.dayOfWeek, start: b.start, end: b.end, roomId: b.roomId })),
      })),
      range: { startDate: '2026-08-10', endDate: '2026-08-31' },
    }) as Promise<unknown>;
  }, proposals) as Promise<{ templates: unknown[] }>;
}

/** Fire the AUTO generator preview, capturing a rejection (SOU-272 fast-fail regression). */
export async function previewAutoExpectingError(
  win: Page,
  groupId: string,
): Promise<{ code: string | null; raw: string }> {
  return win.evaluate(
    async (gid) => {
      // untyped preload bridge in the evaluate sandbox — see Bridge
      const api = (window as unknown as { api: Bridge }).api;
      try {
        await api.invoke('session.generator.preview', {
          mode: 'auto',
          scope: { groups: [gid], teachers: 'all' },
          kind: 'regular',
          weekdayPool: [0, 1, 2, 3, 4, 5, 6],
          sessionsPerWeek: 2,
          minGapDays: 2,
          sessionDurationMinutes: 90,
          range: { startDate: '2026-08-10', endDate: '2026-08-31' },
        });
        return { code: null, raw: 'no-error' };
      } catch (e) {
        const raw = String(e);
        const match = /@@CS_DOMAIN_ERROR@@(.*?)@@CS_DOMAIN_ERROR@@/.exec(raw);
        const code = match ? (JSON.parse(match[1]) as { code: string }).code : null;
        return { code, raw };
      }
    },
    groupId,
  ) as Promise<{ code: string | null; raw: string }>;
}

/** All conflicts of the capacity kind in a preview result, narrowed. */
export function capacityConflicts(result: PreviewResult): CapacityConflict[] {
  return result.conflicts.filter((c): c is CapacityConflict => c.kind === 'capacity');
}

/** Expand the first proposal's `<details>` so its per-block warnings/actions render. */
export async function expandFirstProposal(dialog: Locator): Promise<void> {
  await dialog.locator('summary').first().click();
}
