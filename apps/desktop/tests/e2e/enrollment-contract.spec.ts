import { test, expect } from '@playwright/test';
import { boot, seed, ENROLL_MONTH, type Launched, type Locale } from './enrollment.fixtures';
import { decodeDomainError } from '../../src/shared/ipc/domain-error';

/**
 * SOU-51 — CONTRACT probes through the PUBLIC preload bridge (`window.api.invoke`).
 *
 * Black-box: only public channels are used. These pin the domain + IPC behavior
 * that the roster UI relies on — in particular that each guard's stable `code`
 * survives to the renderer (the Defect-B fix). Neither the Electron IPC bridge nor
 * the preload contextBridge preserves custom error properties, so the code rides
 * inside the rejection *message* as an envelope; the renderer decodes it exactly
 * as this probe does via `decodeDomainError`.
 *
 * Run under both projects; behavior here is locale-independent (no UI copy).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

test('the four guards surface as DISTINCT err.code values across the IPC bridge', async () => {
  live = await boot(locale());
  const win = live.win;

  const s = await seed(win, {
    groupKind: 'regular',
    capacity: 1,
    groupLevel: 'QA-REAL-GRP',
    students: [
      { fr: 'No Sub', ar: 'بدون اشتراك', sub: null }, // -> enrollment-subscription-missing
      { fr: 'Cross Kind', ar: 'تقاطع', sub: { kind: 'exam-prep', covers: 'subject' } }, // -> cross-kind-enrollment
      { fr: 'Valid A', ar: 'صالح أ', sub: { kind: 'regular', covers: 'subject' } },
      { fr: 'Valid B', ar: 'صالح ب', sub: { kind: 'regular', covers: 'subject' } }, // -> group-full (cap 1)
    ],
  });

  const r = await win.evaluate(
    async ({ groupId, students, month }) => {
      const api = (
        window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }
      ).api;
      // Capture the rejection *message* — that is what survives both bridges; the
      // code is decoded from it in Node (below), exactly as the renderer does.
      const enroll = async (studentId: string): Promise<{ ok: boolean; message?: string }> => {
        try {
          await api.invoke('enrollment.create', { studentId, groupId, startMonth: month, endMonth: null });
          return { ok: true };
        } catch (e) {
          return { ok: false, message: String((e as { message?: unknown }).message ?? '') };
        }
      };
      const noSub = await enroll(students[0]!.id);
      const cross = await enroll(students[1]!.id);
      const okA = await enroll(students[2]!.id); // fills capacity 1
      const full = await enroll(students[3]!.id);
      const dup = await enroll(students[2]!.id); // Valid A again
      const roster = (await api.invoke('group.roster', { groupId })) as { roster: unknown[] };
      return { noSub, cross, okA, full, dup, rosterLen: roster.roster.length };
    },
    { groupId: s.groupId, students: s.students, month: ENROLL_MONTH },
  );

  // The stable machine code the renderer maps via t(`errors.${code}`) rides in the
  // rejection message and is decoded here the same way `enrollmentErrorCode` does.
  const codeOf = (res: { ok: boolean; message?: string }): string | null =>
    res.ok ? null : (decodeDomainError(res.message ?? '')?.code ?? null);

  expect({ ok: r.noSub.ok, code: codeOf(r.noSub) }).toEqual({
    ok: false,
    code: 'enrollment-subscription-missing',
  });
  expect({ ok: r.cross.ok, code: codeOf(r.cross) }).toEqual({ ok: false, code: 'cross-kind-enrollment' });
  expect(r.okA).toEqual({ ok: true });
  expect({ ok: r.full.ok, code: codeOf(r.full) }).toEqual({ ok: false, code: 'group-full' });
  expect({ ok: r.dup.ok, code: codeOf(r.dup) }).toEqual({ ok: false, code: 'duplicate-enrollment' });
  // Happy enroll landed in the REAL roster read model.
  expect(r.rosterLen).toBe(1);
});

test('the Groups list read model returns the seeded group (Defect-A fix)', async () => {
  live = await boot(locale());
  const win = live.win;
  const s = await seed(win, {
    groupKind: 'regular',
    capacity: 5,
    groupLevel: 'QA-LIST',
    students: [{ fr: 'A', ar: 'أ', sub: { kind: 'regular', covers: 'subject' } }],
  });

  const realIds = await win.evaluate(async () => {
    const api = (
      window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }
    ).api;
    const list = (await api.invoke('group.listWithCounts', { scope: 'active' })) as {
      groups: { id: string }[];
    };
    return list.groups.map((g) => g.id);
  });
  expect(realIds).toContain(s.groupId);
});
