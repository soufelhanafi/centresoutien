import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-131 — Weekly session create/edit UI + IPC seam
 * (populate the planner).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer / domain / data implementation is
 * imported. Every string the specs assert on is mirrored from the localization
 * catalog (`i18n/fr.json` / `ar.json`) — the user-facing localization contract,
 * exactly as the SOU-50 groups fixtures do.
 *
 * Reference data (rooms / teachers / groups) is seeded through the SAME public
 * IPC channels the app itself uses (`room.create`, `teacher.create`,
 * `group.create`) so the create-session form's own dropdowns are populated.
 * The point of SOU-131 is that a session can be created from the planner with NO
 * DB seed of sessions — so sessions are never pre-seeded; they are created by the
 * UI (or, for a conflict pre-condition, by the same public write channel a user
 * would trigger).
 *
 * Launch switches (documented, shared with the other suites):
 *   - CS_LOCALE       → renderer locale (fr | ar)
 *   - CS_PLAN         → active plan (essentiel | pro | premium)
 *   - --user-data-dir → throwaway Electron userData dir (fresh first run)
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** All copy the specs assert on, mirrored from i18n fr/ar.json. */
export const STR: Record<
  Locale,
  {
    navPlanning: string;
    title: string;
    emptyWeek: string;
    weekdays: Record<number, string>;
    kind: { regular: string; examPrep: string; examPrepShort: string };
    unknownSubject: string;
    form: {
      new: string;
      createTitle: string;
      editTitle: string;
      day: string;
      start: string;
      end: string;
      room: string;
      teacher: string;
      teacherNone: string;
      group: string;
      groupNone: string;
      create: string;
      save: string;
      cancel: string;
      createSuccess: string;
      editSuccess: string;
    };
    conflictTitle: string;
    cancelSession: {
      trigger: string;
      title: string;
      confirm: string;
      success: string;
    };
    errors: {
      malformedTime: string;
      outsideHours: string;
      roomConflict: string;
      teacherConflict: string;
    };
  }
> = {
  fr: {
    navPlanning: 'Planning',
    title: 'Planning hebdomadaire',
    emptyWeek: 'Aucune séance planifiée cette semaine.',
    weekdays: { 0: 'Dimanche', 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi' },
    kind: { regular: 'Régulier', examPrep: 'Préparation examen', examPrepShort: 'PE' },
    unknownSubject: 'Matière inconnue',
    form: {
      new: 'Nouvelle séance',
      createTitle: 'Nouvelle séance',
      editTitle: 'Modifier la séance',
      day: 'Jour',
      start: 'Début',
      end: 'Fin',
      room: 'Salle',
      teacher: 'Enseignant',
      teacherNone: 'Sans enseignant',
      group: 'Groupe',
      groupNone: 'Sans groupe',
      create: 'Créer la séance',
      save: 'Enregistrer',
      cancel: 'Annuler',
      createSuccess: 'Séance créée',
      editSuccess: 'Séance mise à jour',
    },
    conflictTitle: 'Conflit de planning',
    cancelSession: {
      trigger: 'Annuler la séance',
      title: 'Annuler cette séance ?',
      confirm: 'Annuler la séance',
      success: 'Séance annulée',
    },
    errors: {
      malformedTime: "L'heure de fin doit être après l'heure de début",
      outsideHours: "La séance est en dehors des horaires d'ouverture du centre",
      roomConflict: 'La salle est déjà occupée sur ce créneau',
      teacherConflict: "L'enseignant a déjà une séance sur ce créneau",
      seatCapacity: "Ce groupe compte plus d'élèves que la capacité de cette salle",
    },
  },
  ar: {
    navPlanning: 'الجدولة',
    title: 'الجدول الأسبوعي',
    emptyWeek: 'لا توجد حصص مبرمجة هذا الأسبوع.',
    weekdays: { 0: 'الأحد', 1: 'الإثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' },
    kind: { regular: 'عادي', examPrep: 'تحضير الامتحان', examPrepShort: 'ت.إ' },
    unknownSubject: 'مادة غير معروفة',
    form: {
      new: 'حصة جديدة',
      createTitle: 'حصة جديدة',
      editTitle: 'تعديل الحصة',
      day: 'اليوم',
      start: 'البداية',
      end: 'النهاية',
      room: 'القاعة',
      teacher: 'الأستاذ',
      teacherNone: 'بدون أستاذ',
      group: 'المجموعة',
      groupNone: 'بدون مجموعة',
      create: 'إنشاء الحصة',
      save: 'حفظ',
      cancel: 'إلغاء',
      createSuccess: 'تم إنشاء الحصة',
      editSuccess: 'تم تحديث الحصة',
    },
    conflictTitle: 'تعارض في الجدول',
    cancelSession: {
      trigger: 'إلغاء الحصة',
      title: 'إلغاء هذه الحصة؟',
      confirm: 'إلغاء الحصة',
      success: 'تم إلغاء الحصة',
    },
    errors: {
      malformedTime: 'يجب أن يكون وقت النهاية بعد وقت البداية',
      outsideHours: 'الحصة خارج أوقات عمل المركز',
      roomConflict: 'القاعة محجوزة بالفعل في هذا التوقيت',
      teacherConflict: 'لدى الأستاذ حصة بالفعل في هذا التوقيت',
      seatCapacity: 'يتجاوز عدد تلاميذ هذه المجموعة سعة هذه القاعة',
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-planning-'));
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

export type SeededRoom = { id: string; name: string };
export type SeededTeacher = { id: string; nameFr: string; nameAr: string };
export type SeededGroup = { id: string; level: string };

export type SeedSpec = {
  rooms?: { name: string; capacity?: number }[];
  teachers?: { nameFr: string; nameAr: string; phone: string }[];
  /** Groups need a subject + teacher; the fixture wires those internally. A group carries no room (SOU-176). */
  groups?: { level: string; capacity?: number; kind?: 'regular' | 'exam-prep' }[];
};

export type Seeded = {
  rooms: SeededRoom[];
  teachers: SeededTeacher[];
  groups: SeededGroup[];
};

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/**
 * Launch, get past first-run + auth into the shell (no wizard — so NO saved
 * center hours, exercising the 09:00–18:00 default), and seed reference data
 * through the public bridge so the create-session form's dropdowns are populated.
 */
export async function boot(locale: Locale, seed: SeedSpec = {}, plan: PlanId = 'premium'): Promise<Launched & { seeded: Seeded }> {
  const live = await launch(locale, plan, freshUserDataDir());

  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);

  const seeded = (await live.win.evaluate(async (s) => {
    const api = (window as unknown as { api: Bridge }).api;

    const rooms: { id: string; name: string }[] = [];
    for (const r of s.rooms ?? []) {
      const res = (await api.invoke('room.create', { name: r.name, capacity: r.capacity ?? 20 })) as { id: string };
      rooms.push({ id: res.id, name: r.name });
    }

    const teachers: { id: string; nameFr: string; nameAr: string }[] = [];
    for (const t of s.teachers ?? []) {
      const res = (await api.invoke('teacher.create', {
        name: { fr: t.nameFr, ar: t.nameAr },
        phone: t.phone,
        subjectIds: [],
      })) as { id: string };
      teachers.push({ id: res.id, nameFr: t.nameFr, nameAr: t.nameAr });
    }

    const groups: { id: string; level: string }[] = [];
    if ((s.groups ?? []).length > 0) {
      // A group requires a subject; create one and reuse a teacher. A group carries no room (SOU-176).
      const subj = (await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      })) as { id: string };
      const teacherId = teachers[0]?.id;
      for (const g of s.groups ?? []) {
        const res = (await api.invoke('group.create', {
          subjectId: subj.id,
          teacherId: teacherId ?? null,
          level: g.level,
          capacity: g.capacity ?? 15,
          kind: g.kind ?? 'regular',
        })) as { id: string };
        groups.push({ id: res.id, level: g.level });
      }
    }

    return { rooms, teachers, groups };
  }, seed)) as Seeded;

  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');

  return { ...live, seeded };
}

/** Navigate to the weekly planner via the sidebar. */
export async function gotoPlanning(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.title }).waitFor();
}

/**
 * Create a weekly recurring session directly through the public write channel a
 * user's click ultimately triggers — used only to establish a conflict
 * PRE-CONDITION (an already-booked slot) before the UI tries to double-book it.
 * Returns the new session id.
 */
export async function createSessionViaBridge(
  win: Page,
  input: { roomId: string; teacherId?: string | null; groupId?: string | null; dayOfWeek: number; start: string; end: string },
): Promise<string> {
  const res = (await win.evaluate(async (i) => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('weeklySession.create', {
      roomId: i.roomId,
      teacherId: i.teacherId ?? null,
      groupId: i.groupId ?? null,
      dayOfWeek: i.dayOfWeek,
      start: i.start,
      end: i.end,
    });
  }, input)) as { id: string };
  return res.id;
}

/** Read the live weekly read model through the public channel (persistence proof). */
export async function readWeek(win: Page): Promise<
  { id: string; dayOfWeek: number; start: string; end: string; roomId: string; teacherId: string | null; groupId: string | null }[]
> {
  const res = (await win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('session.week', {});
  })) as { sessions: { id: string; dayOfWeek: number; start: string; end: string; roomId: string; teacherId: string | null; groupId: string | null }[] };
  return res.sessions;
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}
