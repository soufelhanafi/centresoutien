import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-51 — Group ↔ Student enrollment UI on real IPC.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/use-case/adapter implementation is
 * imported. Reference data (subject, room, student, group, subscription) is
 * seeded through the same public channels the UI uses; the specs then drive the
 * roster UI and assert on the localized user-facing copy mirrored from
 * `i18n/fr.json` / `ar.json`.
 *
 * Launch switches (shared with the other suites):
 *   - CS_LOCALE       → renderer locale (fr | ar)
 *   - CS_PLAN         → active plan (essentiel | pro | premium)
 *   - --user-data-dir → throwaway Electron userData dir (fresh first run)
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';
export type Kind = 'regular' | 'exam-prep';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** Enrollment month used everywhere; subscriptions start well before it. */
export const ENROLL_MONTH = '2026-08';
export const SUB_START = '2025-09';

/** All copy the specs assert on, mirrored from i18n fr/ar.json. */
export const STR: Record<
  Locale,
  {
    navGroups: string;
    row: { menu: string; open: string };
    roster: {
      title: string;
      add: string;
      studentPlaceholder: string;
      addConfirm: string;
      addSuccess: string;
      addError: string; // generic fallback — must NOT appear for a known guard
      remove: string;
      removeSuccess: string;
      emptyTitle: string;
      noCandidates: string;
    };
    guard: {
      groupFull: string;
      duplicate: string;
      crossKind: string;
      subscriptionMissing: string;
    };
  }
> = {
  fr: {
    navGroups: 'Groupes',
    row: { menu: 'Actions du groupe', open: 'Ouvrir' },
    roster: {
      title: 'Élèves inscrits',
      add: 'Ajouter un élève',
      studentPlaceholder: 'Choisir un élève',
      addConfirm: 'Inscrire',
      addSuccess: 'Élève inscrit',
      addError: "L'inscription a échoué",
      remove: 'Retirer',
      removeSuccess: 'Élève retiré',
      emptyTitle: 'Aucun élève inscrit',
      noCandidates: 'Aucun élève disponible à inscrire.',
    },
    guard: {
      groupFull: 'Ce groupe est complet : toutes les places sont occupées.',
      duplicate: 'Cet élève est déjà inscrit dans ce groupe.',
      crossKind:
        "L'abonnement de l'élève ne correspond pas au type du groupe (régulier / prépa examen).",
      subscriptionMissing: "L'élève n'a aucun abonnement actif couvrant la matière de ce groupe.",
    },
  },
  ar: {
    navGroups: 'المجموعات',
    row: { menu: 'إجراءات المجموعة', open: 'فتح' },
    roster: {
      title: 'الطلبة المسجّلون',
      add: 'إضافة طالب',
      studentPlaceholder: 'اختر طالبًا',
      addConfirm: 'تسجيل',
      addSuccess: 'تم تسجيل الطالب',
      addError: 'فشل التسجيل',
      remove: 'إزالة',
      removeSuccess: 'تمت إزالة الطالب',
      emptyTitle: 'لا يوجد طلبة مسجّلون',
      noCandidates: 'لا يوجد طلبة متاحون للتسجيل.',
    },
    guard: {
      groupFull: 'هذه المجموعة مكتملة: جميع المقاعد مشغولة.',
      duplicate: 'هذا التلميذ مسجّل بالفعل في هذه المجموعة.',
      crossKind: 'اشتراك التلميذ لا يطابق نوع المجموعة (عادي / تحضير الامتحان).',
      subscriptionMissing: 'لا يملك التلميذ أي اشتراك نشط يغطي مادة هذه المجموعة.',
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-enroll-'));
}

export type Launched = { app: ElectronApplication; win: Page };

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** Launch, seed admin, establish a remembered session, reload into the shell. */
export async function boot(locale: Locale, plan: PlanId = 'premium'): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } })
      .api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return live;
}

export type StudentSeed = {
  fr: string;
  ar: string;
  /** subscription to seed for this student, or `null` for none. */
  sub: { kind: Kind; covers: 'subject' | 'other' } | null;
};

export type Seed = {
  subjectId: string;
  otherSubjectId: string;
  roomId: string;
  groupId: string;
  groupLevel: string;
  students: { id: string; fr: string; ar: string }[];
};

/**
 * Seed one subject, one room, a group (given kind + capacity), and N students —
 * each optionally carrying a subscription. Returns the created ids so specs can
 * target rows/candidates deterministically. All through the public bridge.
 */
export async function seed(
  win: Page,
  opts: { groupKind: Kind; capacity: number; groupLevel: string; students: StudentSeed[] },
): Promise<Seed> {
  return win.evaluate(
    async ({ groupKind, capacity, groupLevel, students, SUB_START }) => {
      const api = (
        window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<{ id: string }> } }
      ).api;

      // A syntactically valid `fml_{ULID}` id (26 Crockford chars, digits only).
      const formulaId = (n: number): string => `fml_01HW${String(n).padStart(22, '0')}`;

      const subject = await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      });
      const otherSubject = await api.invoke('subject.create', {
        name: { fr: 'Physique', ar: 'الفيزياء' },
        code: 'PHYS',
      });
      const room = await api.invoke('room.create', { name: 'Salle QA', capacity: 30 });

      const group = await api.invoke('group.create', {
        subjectId: subject.id,
        teacherId: null,
        roomId: room.id,
        level: groupLevel,
        capacity,
        kind: groupKind,
      });

      const created: { id: string; fr: string; ar: string }[] = [];
      let f = 1;
      for (const s of students) {
        const student = await api.invoke('student.create', {
          name: { fr: s.fr, ar: s.ar },
          birthDate: '2010-05-05',
          level: groupLevel,
          school: null,
          notes: null,
          guardianIds: [],
        });
        if (s.sub) {
          const coveredSubjectId = s.sub.covers === 'subject' ? subject.id : otherSubject.id;
          await api.invoke('subscription.create', {
            studentId: student.id,
            formulaId: formulaId(f++),
            kind: s.sub.kind,
            subjectIds: [coveredSubjectId],
            startMonth: SUB_START,
            endMonth: null,
          });
        }
        created.push({ id: student.id, fr: s.fr, ar: s.ar });
      }

      return {
        subjectId: subject.id,
        otherSubjectId: otherSubject.id,
        roomId: room.id,
        groupId: group.id,
        groupLevel,
        students: created,
      };
    },
    { ...opts, SUB_START },
  );
}

/** Enroll a student directly through the public bridge (bypasses the roster UI). */
export async function enrollViaApi(
  win: Page,
  studentId: string,
  groupId: string,
): Promise<void> {
  await win.evaluate(
    async ({ studentId, groupId, ENROLL_MONTH }) => {
      const api = (
        window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }
      ).api;
      await api.invoke('enrollment.create', {
        studentId,
        groupId,
        startMonth: ENROLL_MONTH,
        endMonth: null,
      });
    },
    { studentId, groupId, ENROLL_MONTH },
  );
}

/** Attempt an enroll through the bridge and return the rejection text (or null). */
export async function tryEnrollViaApi(
  win: Page,
  studentId: string,
  groupId: string,
): Promise<string | null> {
  return win.evaluate(
    async ({ studentId, groupId, ENROLL_MONTH }) => {
      const api = (
        window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }
      ).api;
      try {
        await api.invoke('enrollment.create', {
          studentId,
          groupId,
          startMonth: ENROLL_MONTH,
          endMonth: null,
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    { studentId, groupId, ENROLL_MONTH },
  );
}

export async function gotoGroups(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navGroups, exact: true }).click();
  await win.waitForTimeout(400);
}

/** Open the seeded group's detail (roster) page from the list. */
export async function openGroupDetail(
  win: Page,
  L: (typeof STR)[Locale],
  level: string,
): Promise<void> {
  const row = win.getByRole('row', { name: new RegExp(level) }).first();
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.open }).click();
  await win.waitForTimeout(400);
}

export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() =>
    /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText),
  );
}
