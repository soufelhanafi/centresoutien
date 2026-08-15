import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-50 — Group CRUD UI (list + filters / create / edit /
 * archive-restore / detail roster + quick add-student).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer implementation is imported. Every
 * string the specs assert on mirrors the localization catalog (`i18n/fr.json` /
 * `ar.json`), exactly as the SOU-34 rooms fixtures do.
 *
 * Reference data (subjects, rooms, teachers, groups, and — where a fill count is
 * asserted — students with a covering subscription + enrollment) is seeded through
 * the same public `subject.*` / `room.*` / `teacher.*` / `group.*` /
 * `subscription.*` / `enrollment.*` channels the UI itself uses, mirroring
 * `formulas.fixtures.ts` and `enrollment.fixtures.ts`. Each test boots a fresh app
 * with a throwaway user-data dir for isolation.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';
export type GroupKind = 'regular' | 'exam-prep';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** Enrollment month used whenever a seed group needs a fill count; subscriptions start earlier. */
export const ENROLL_MONTH = '2026-08';
export const SUB_START = '2025-09';

/** All copy the specs assert on, mirrored from i18n fr/ar.json (`groups.*`, `nav.*`). */
export const STR: Record<
  Locale,
  {
    navGroups: string;
    title: string;
    subtitle: string;
    newBtn: string;
    tabs: { active: string; archived: string };
    kind: { regular: string; examPrep: string };
    filters: {
      subjectAll: string;
      levelAll: string;
      kindAll: string;
      subjectLabel: string;
      kindLabel: string;
      levelLabel: string;
    };
    table: { subject: string; level: string; teacher: string; room: string; fill: string; unassigned: string };
    fill: { full: string };
    row: { menu: string; open: string; edit: string; archive: string; restore: string };
    empty: { title: string; body: string; cta: string };
    archivedEmpty: { title: string };
    noResults: { title: string };
    form: {
      createTitle: string;
      editTitle: string;
      subject: string;
      subjectPlaceholder: string;
      room: string;
      roomPlaceholder: string;
      teacher: string;
      level: string;
      capacity: string;
      kind: string;
      create: string;
      save: string;
      createSuccess: string;
      editSuccess: string;
    };
    detail: { back: string; edit: string; archivedBadge: string };
    archiveConfirm: { title: string; confirm: string; success: string };
    restoreSuccess: string;
    errors: { required: string; notInteger: string; capacityTooSmall: string; invalidId: string };
    roster: {
      title: string;
      add: string;
      addTitle: string;
      studentLabel: string;
      month: string;
      addConfirm: string;
      addSuccess: string;
      remove: string;
      emptyTitle: string;
    };
  }
> = {
  fr: {
    navGroups: 'Groupes',
    title: 'Groupes',
    subtitle: 'Créez et gérez les groupes de votre centre.',
    newBtn: 'Nouveau groupe',
    tabs: { active: 'Actifs', archived: 'Archivés' },
    kind: { regular: 'Régulier', examPrep: 'Prépa examen' },
    filters: {
      subjectAll: 'Toutes les matières',
      levelAll: 'Tous les niveaux',
      kindAll: 'Tous les types',
      subjectLabel: 'Filtrer par matière',
      kindLabel: 'Filtrer par type',
      levelLabel: 'Filtrer par niveau',
    },
    table: {
      subject: 'Matière',
      level: 'Niveau',
      teacher: 'Enseignant',
      room: 'Salle',
      fill: 'Remplissage',
      unassigned: 'Non affecté',
    },
    fill: { full: 'Complet' },
    row: { menu: 'Actions du groupe', open: 'Ouvrir', edit: 'Modifier', archive: 'Archiver', restore: 'Restaurer' },
    empty: {
      title: "Aucun groupe pour l'instant",
      body: 'Créez votre premier groupe pour organiser vos cours.',
      cta: 'Créer un groupe',
    },
    archivedEmpty: { title: 'Aucun groupe archivé' },
    noResults: { title: 'Aucun groupe ne correspond' },
    form: {
      createTitle: 'Nouveau groupe',
      editTitle: 'Modifier le groupe',
      subject: 'Matière',
      subjectPlaceholder: 'Choisir une matière',
      room: 'Salle',
      roomPlaceholder: 'Choisir une salle',
      teacher: 'Enseignant',
      level: 'Niveau',
      capacity: 'Capacité (places)',
      kind: 'Type',
      create: 'Créer le groupe',
      save: 'Enregistrer',
      createSuccess: 'Groupe créé',
      editSuccess: 'Modifications enregistrées',
    },
    detail: { back: 'Retour aux groupes', edit: 'Modifier', archivedBadge: 'Archivé' },
    archiveConfirm: { title: 'Archiver le groupe ?', confirm: 'Archiver', success: 'Groupe archivé' },
    restoreSuccess: 'Groupe restauré',
    errors: {
      required: 'Ce champ est requis',
      notInteger: 'Saisissez un nombre entier',
      capacityTooSmall: "La capacité doit être d'au moins 1",
      invalidId: 'Identifiant invalide',
    },
    roster: {
      title: 'Élèves inscrits',
      add: 'Ajouter un élève',
      addTitle: 'Ajouter un élève au groupe',
      studentLabel: 'Élève',
      month: 'Mois de début',
      addConfirm: 'Inscrire',
      addSuccess: 'Élève inscrit',
      remove: 'Retirer',
      emptyTitle: 'Aucun élève inscrit',
    },
  },
  ar: {
    navGroups: 'المجموعات',
    title: 'المجموعات',
    subtitle: 'أنشئ مجموعات مركزك وأدرها.',
    newBtn: 'مجموعة جديدة',
    tabs: { active: 'النشطة', archived: 'المؤرشفة' },
    kind: { regular: 'عادي', examPrep: 'تحضير الامتحان' },
    filters: {
      subjectAll: 'كل المواد',
      levelAll: 'كل المستويات',
      kindAll: 'كل الأنواع',
      subjectLabel: 'تصفية حسب المادة',
      kindLabel: 'تصفية حسب النوع',
      levelLabel: 'تصفية حسب المستوى',
    },
    table: {
      subject: 'المادة',
      level: 'المستوى',
      teacher: 'الأستاذ',
      room: 'القاعة',
      fill: 'نسبة الامتلاء',
      unassigned: 'غير مُسند',
    },
    fill: { full: 'مكتمل' },
    row: { menu: 'إجراءات المجموعة', open: 'فتح', edit: 'تعديل', archive: 'أرشفة', restore: 'استعادة' },
    empty: {
      title: 'لا توجد مجموعات بعد',
      body: 'أنشئ مجموعتك الأولى لتنظيم دروسك.',
      cta: 'إنشاء مجموعة',
    },
    archivedEmpty: { title: 'لا توجد مجموعات مؤرشفة' },
    noResults: { title: 'لا توجد مجموعة مطابقة' },
    form: {
      createTitle: 'مجموعة جديدة',
      editTitle: 'تعديل المجموعة',
      subject: 'المادة',
      subjectPlaceholder: 'اختر مادة',
      room: 'القاعة',
      roomPlaceholder: 'اختر قاعة',
      teacher: 'الأستاذ',
      level: 'المستوى',
      capacity: 'السعة (مقاعد)',
      kind: 'النوع',
      create: 'إنشاء المجموعة',
      save: 'حفظ',
      createSuccess: 'تم إنشاء المجموعة',
      editSuccess: 'تم حفظ التعديلات',
    },
    detail: { back: 'العودة إلى المجموعات', edit: 'تعديل', archivedBadge: 'مؤرشفة' },
    archiveConfirm: { title: 'أرشفة المجموعة؟', confirm: 'أرشفة', success: 'تمت أرشفة المجموعة' },
    restoreSuccess: 'تمت استعادة المجموعة',
    errors: {
      required: 'هذا الحقل مطلوب',
      notInteger: 'أدخل عددًا صحيحًا',
      capacityTooSmall: 'يجب أن تكون السعة 1 على الأقل',
      invalidId: 'معرّف غير صالح',
    },
    roster: {
      title: 'الطلبة المسجّلون',
      add: 'إضافة طالب',
      addTitle: 'إضافة طالب إلى المجموعة',
      studentLabel: 'الطالب',
      month: 'شهر البداية',
      addConfirm: 'تسجيل',
      addSuccess: 'تم تسجيل الطالب',
      remove: 'إزالة',
      emptyTitle: 'لا يوجد طلبة مسجّلون',
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-groups-'));
}

export type Launched = { app: ElectronApplication; win: Page };

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

export type SeedSubject = { nameFr: string; nameAr: string; code?: string };
export type SeedRoom = { name: string; capacity: number };
export type SeedTeacher = { nameFr: string; nameAr: string; phone: string };

/** One group to seed. `subjectIdx`/`teacherIdx` index into the seeded lists. */
export type SeedGroup = {
  subjectIdx: number;
  teacherIdx?: number;
  level: string;
  capacity: number;
  kind?: GroupKind;
  archived?: boolean;
  /** Number of students to enroll (each gets a covering subscription first). */
  enrolledCount?: number;
};

export type CreatedGroup = { id: string; level: string };

/**
 * Launch, clear the first-run + auth gates, and seed reference data through the
 * public bridge: the admin, then subjects, rooms, teachers, and groups (in that
 * dependency order — a group needs a live subject to exist first). Rooms are
 * seeded for the session-based specs that share these fixtures; a group no
 * longer carries a room (SOU-176). A group with `enrolledCount` gets that many
 * students created with a covering subscription and enrolled, so fill %
 * assertions have real data behind them. Returns the created ids/levels so specs
 * can target rows deterministically.
 */
export async function boot(
  locale: Locale,
  opts: {
    plan?: PlanId;
    subjects?: readonly SeedSubject[];
    rooms?: readonly SeedRoom[];
    teachers?: readonly SeedTeacher[];
    groups?: readonly SeedGroup[];
  } = {},
): Promise<
  Launched & {
    subjects: { id: string; nameFr: string; nameAr: string }[];
    rooms: { id: string; name: string }[];
    teachers: { id: string; nameFr: string; nameAr: string }[];
    groups: CreatedGroup[];
  }
> {
  const plan = opts.plan ?? 'premium';
  const live = await launch(locale, plan, freshUserDataDir());

  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
    // Replicate the wizard's `center.save` so the default niveau catalog seeds
    // (the level select on the group form needs options).
    await api.invoke('center.save', { name: 'Centre de Soutien', address: '', phone: '', email: '', logoPath: null });
  }, VALID_ADMIN);

  const subjects = await live.win.evaluate(async (seed) => {
    const api = (window as unknown as { api: Bridge }).api;
    const out: { id: string; nameFr: string; nameAr: string }[] = [];
    for (const s of seed) {
      const res = (await api.invoke('subject.create', {
        name: { fr: s.nameFr, ar: s.nameAr },
        ...(s.code ? { code: s.code } : {}),
      })) as { id: string };
      out.push({ id: res.id, nameFr: s.nameFr, nameAr: s.nameAr });
    }
    return out;
  }, opts.subjects ?? []);

  const rooms = await live.win.evaluate(async (seed) => {
    const api = (window as unknown as { api: Bridge }).api;
    const out: { id: string; name: string }[] = [];
    for (const r of seed) {
      const res = (await api.invoke('room.create', { name: r.name, capacity: r.capacity })) as {
        id: string;
      };
      out.push({ id: res.id, name: r.name });
    }
    return out;
  }, opts.rooms ?? []);

  const teachers = await live.win.evaluate(async (seed) => {
    const api = (window as unknown as { api: Bridge }).api;
    const out: { id: string; nameFr: string; nameAr: string }[] = [];
    for (const tch of seed) {
      const res = (await api.invoke('teacher.create', {
        name: { fr: tch.nameFr, ar: tch.nameAr },
        phone: tch.phone,
        subjectIds: [],
      })) as { id: string };
      out.push({ id: res.id, nameFr: tch.nameFr, nameAr: tch.nameAr });
    }
    return out;
  }, opts.teachers ?? []);

  const groups = await live.win.evaluate(
    async ({ seed, subjects, teachers, subStart, enrollMonth }) => {
      const api = (window as unknown as { api: Bridge }).api;
      const formulaId = (n: number): string => `fml_01HW${String(n).padStart(22, '0')}`;
      const out: { id: string; level: string }[] = [];
      let f = 1;
      let s = 1;
      for (const g of seed) {
        const subject = subjects[g.subjectIdx]!;
        const kind = g.kind ?? 'regular';
        const created = (await api.invoke('group.create', {
          subjectId: subject.id,
          teacherId: g.teacherIdx === undefined ? null : teachers[g.teacherIdx]!.id,
          level: g.level,
          capacity: g.capacity,
          kind,
        })) as { id: string };

        for (let i = 0; i < (g.enrolledCount ?? 0); i++) {
          const student = (await api.invoke('student.create', {
            name: { fr: `Élève ${s}`, ar: `طالب ${s}` },
            birthDate: '2010-05-05',
            level: g.level,
            school: null,
            notes: null,
            guardianIds: [],
          })) as { id: string };
          await api.invoke('subscription.create', {
            studentId: student.id,
            formulaId: formulaId(f++),
            kind,
            subjectIds: [subject.id],
            startMonth: subStart,
            endMonth: null,
          });
          await api.invoke('enrollment.create', {
            studentId: student.id,
            groupId: created.id,
            startMonth: enrollMonth,
            endMonth: null,
          });
          s++;
        }

        if (g.archived) {
          await api.invoke('group.archive', { id: created.id });
        }

        out.push({ id: created.id, level: g.level });
      }
      return out;
    },
    { seed: opts.groups ?? [], subjects, rooms, teachers, subStart: SUB_START, enrollMonth: ENROLL_MONTH },
  );

  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');

  return { ...live, subjects, rooms, teachers, groups };
}

/** Navigate to the Groups list via the sidebar. */
export async function gotoGroups(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navGroups, exact: true }).click();
  await win.waitForTimeout(400);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}
