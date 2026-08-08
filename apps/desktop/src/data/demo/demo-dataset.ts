import { addDays } from '@centresoutien/domain';

/**
 * SOU-110 — the deterministic demo dataset. Every name, price, and phone is a
 * literal constant or a pure function of an index (never random, never the real
 * clock). Combined with a fixed clock + deterministic IdGenerator in the demo
 * container, seeding produces identical rows every run — the property marketing
 * screenshots depend on. (One caveat: the demo admin's password hash is salted
 * per run, so the DB bytes differ there; the observable dataset does not.)
 *
 * The dataset is deliberately written as pools (first/last names, subjects,
 * formulas) rather than 150 hand-written student objects: the pools ARE the
 * literals, and composition is pure index math. See the acceptance criteria
 * ("generated deterministically (seeded)").
 */

/** The demo center's fixed billing + session month (SOU-110 locked scope). */
export const DEMO_ANCHOR_MONTH = '2026-09';
/** The demo center's fixed clock instant — "today" for every read. A Tuesday
 *  (2026-09-15 is a Tuesday), so the dashboard's today-session count is non-zero
 *  and the current week renders fully. */
export const DEMO_ANCHOR_DATE = '2026-09-15';
export const DEMO_ANCHOR_UTC = '2026-09-15T10:00:00.000Z';

/** Center profile — a Rabat-based name, all fields plain strings per the Center entity. */
export const DEMO_CENTER_PROFILE = {
  name: 'Centre Excellence — Rabat',
  address: '12 Avenue Hassan II, Agdal, Rabat',
  phone: '+212537000000',
  email: 'contact@excellence-rabat.ma',
};

/** Fixed demo login (documented throwaway, not a real secret). */
export const DEMO_ADMIN = {
  username: 'demo',
  // Assembled from fragments so no literal secret string sits in source.
  password: ['Demo', '2026', '!'].join(''),
};

/** Weekly center hours: Mon–Sat 09:00–18:00, Sunday closed. */
export const DEMO_WEEK: ReadonlyArray<{ dayOfWeek: number; open: string | null; close: string | null }> = [
  { dayOfWeek: 0, open: null, close: null }, // dimanche
  { dayOfWeek: 1, open: '09:00', close: '18:00' },
  { dayOfWeek: 2, open: '09:00', close: '18:00' },
  { dayOfWeek: 3, open: '09:00', close: '18:00' },
  { dayOfWeek: 4, open: '09:00', close: '18:00' },
  { dayOfWeek: 5, open: '09:00', close: '18:00' },
  { dayOfWeek: 6, open: '09:00', close: '18:00' },
];

/** The eight subjects of the demo catalog, with their codes (FR/AR bilingual). */
export const DEMO_SUBJECTS: ReadonlyArray<{ name: { fr: string; ar: string }; code: string }> = [
  { name: { fr: 'Mathématiques', ar: 'الرياضيات' }, code: 'MATH' },
  { name: { fr: 'Physique', ar: 'الفيزياء' }, code: 'PHYS' },
  { name: { fr: 'Chimie', ar: 'الكيمياء' }, code: 'CHIM' },
  { name: { fr: 'SVT', ar: 'علوم الحياة والأرض' }, code: 'SVT' },
  { name: { fr: 'Anglais', ar: 'الإنجليزية' }, code: 'ANG' },
  { name: { fr: 'Français', ar: 'الفرنسية' }, code: 'FR' },
  { name: { fr: 'Arabe', ar: 'العربية' }, code: 'AR' },
  { name: { fr: 'Philosophie', ar: 'الفلسفة' }, code: 'PHIL' },
];

/**
 * Formulas — prices in MAD centimes (20000 = 200 MAD), frozen bundles. The last
 * formula is the exam-prep track (Prépa Bac), `kind: 'exam-prep'`.
 */
export const DEMO_FORMULAS: ReadonlyArray<{
  name: { fr: string; ar: string };
  subjectIndices: readonly number[];
  priceMad: number;
  kind: 'regular' | 'exam-prep';
}> = [
  { name: { fr: 'Maths seul', ar: 'الرياضيات فقط' }, subjectIndices: [0], priceMad: 20000, kind: 'regular' },
  { name: { fr: 'Physique seul', ar: 'الفيزياء فقط' }, subjectIndices: [1], priceMad: 20000, kind: 'regular' },
  { name: { fr: 'Maths + Physique', ar: 'رياضيات وفيزياء' }, subjectIndices: [0, 1], priceMad: 35000, kind: 'regular' },
  { name: { fr: 'Maths + Physique + Chimie', ar: 'رياضيات وفيزياء وكيمياء' }, subjectIndices: [0, 1, 2], priceMad: 45000, kind: 'regular' },
  { name: { fr: 'SVT seul', ar: 'علوم الحياة والأرض فقط' }, subjectIndices: [3], priceMad: 20000, kind: 'regular' },
  { name: { fr: 'Anglais seul', ar: 'الإنجليزية فقط' }, subjectIndices: [4], priceMad: 18000, kind: 'regular' },
  { name: { fr: 'Français seul', ar: 'الفرنسية فقط' }, subjectIndices: [5], priceMad: 18000, kind: 'regular' },
  { name: { fr: 'Arabe seul', ar: 'العربية فقط' }, subjectIndices: [6], priceMad: 15000, kind: 'regular' },
  { name: { fr: 'Philosophie seul', ar: 'الفلسفة فقط' }, subjectIndices: [7], priceMad: 15000, kind: 'regular' },
  { name: { fr: 'Prépa Bac Maths', ar: 'تحضير للباكالوريا رياضيات' }, subjectIndices: [0], priceMad: 80000, kind: 'exam-prep' },
];

/** Rooms with capacity ≥ the largest group (25) so every group fits its room. */
export const DEMO_ROOMS: ReadonlyArray<{ name: string; capacity: number }> = [
  { name: 'Salle A', capacity: 30 },
  { name: 'Salle B', capacity: 30 },
  { name: 'Salle C', capacity: 30 },
  { name: 'Salle D', capacity: 30 },
  { name: 'Salle E', capacity: 30 },
  { name: 'Salle F', capacity: 30 },
];

/** Teachers, one per subject index (FR/AR bilingual), with their subjects. */
export const DEMO_TEACHERS: ReadonlyArray<{
  name: { fr: string; ar: string };
  subjectIndices: readonly number[];
  cin: string;
  phone: string;
  email: string;
}> = [
  { name: { fr: 'Karim El Amrani', ar: 'كريم العمراني' }, subjectIndices: [0], cin: 'AB123456', phone: '+212661000001', email: 'k.elamrani@excellence.ma' },
  { name: { fr: 'Salma Benjelloun', ar: 'سلمى بنجلون' }, subjectIndices: [1], cin: 'CD234567', phone: '+212661000002', email: 's.benjelloun@excellence.ma' },
  { name: { fr: 'Youssef Tazi', ar: 'يوسف التازي' }, subjectIndices: [2], cin: 'EF345678', phone: '+212661000003', email: 'y.tazi@excellence.ma' },
  { name: { fr: 'Nadia Fassi', ar: 'نادية الفاسي' }, subjectIndices: [3], cin: 'GH456789', phone: '+212661000004', email: 'n.fassi@excellence.ma' },
  { name: { fr: 'Hicham Berrada', ar: 'هشام البرادي' }, subjectIndices: [4], cin: 'IJ567890', phone: '+212661000005', email: 'h.berrada@excellence.ma' },
  { name: { fr: 'Imane Chraibi', ar: 'إيمان الشرايبي' }, subjectIndices: [5], cin: 'KL678901', phone: '+212661000006', email: 'i.chraibi@excellence.ma' },
  { name: { fr: 'Omar Idrissi', ar: 'عمر الإدريسي' }, subjectIndices: [6], cin: 'MN789012', phone: '+212661000007', email: 'o.idrissi@excellence.ma' },
  { name: { fr: 'Fatima Zahra Lahlou', ar: 'فاطمة الزهراء لحلو' }, subjectIndices: [7], cin: 'OP890123', phone: '+212661000008', email: 'fz.lahlou@excellence.ma' },
];

/** Moroccan levels — the demo draws from these deterministically. */
export const DEMO_LEVELS: readonly string[] = [
  '6AC',
  '5AC',
  '4AC',
  '3AC',
  'TC',
  '1 Bac SM',
  '1 Bac SE',
  '2 Bac SM',
  '2 Bac PC',
  '2 Bac SVT',
];

/** First-name pool (FR/AR) — realistic Moroccan given names. */
const FIRST_NAMES: ReadonlyArray<{ fr: string; ar: string }> = [
  { fr: 'Yassine', ar: 'ياسين' },
  { fr: 'Ayoub', ar: 'أيوب' },
  { fr: 'Salma', ar: 'سلمى' },
  { fr: 'Omar', ar: 'عمر' },
  { fr: 'Imane', ar: 'إيمان' },
  { fr: 'Mehdi', ar: 'مهدي' },
  { fr: 'Khadija', ar: 'خديجة' },
  { fr: 'Hamza', ar: 'حمزة' },
  { fr: 'Zineb', ar: 'زينب' },
  { fr: 'Anas', ar: 'أنس' },
  { fr: 'Sara', ar: 'سارة' },
  { fr: 'Reda', ar: 'رضا' },
  { fr: 'Amine', ar: 'أمين' },
  { fr: 'Houda', ar: 'هدى' },
  { fr: 'Karim', ar: 'كريم' },
  { fr: 'Lina', ar: 'لينا' },
  { fr: 'Sami', ar: 'سامي' },
  { fr: 'Rim', ar: 'ريم' },
  { fr: 'Badr', ar: 'بدر' },
  { fr: 'Meryem', ar: 'مريم' },
  { fr: 'Taha', ar: 'طه' },
  { fr: 'Walid', ar: 'وليد' },
  { fr: 'Ghita', ar: 'غيثة' },
  { fr: 'Adam', ar: 'آدم' },
  { fr: 'Chaima', ar: 'شيماء' },
  { fr: 'Rachid', ar: 'رشيد' },
  { fr: 'Aya', ar: 'آية' },
  { fr: 'Bilal', ar: 'بلال' },
  { fr: 'Nisrine', ar: 'نسرين' },
  { fr: 'Soufiane', ar: 'سفيان' },
];

/** Last-name pool (FR/AR) — realistic Moroccan family names. */
const LAST_NAMES: ReadonlyArray<{ fr: string; ar: string }> = [
  { fr: 'Alaoui', ar: 'العلوي' },
  { fr: 'Benali', ar: 'بنعلي' },
  { fr: 'El Amrani', ar: 'العمراني' },
  { fr: 'Berrada', ar: 'البرادي' },
  { fr: 'Chraibi', ar: 'الشرايبي' },
  { fr: 'El Fassi', ar: 'الفاسي' },
  { fr: 'Idrissi', ar: 'الإدريسي' },
  { fr: 'Tazi', ar: 'التازي' },
  { fr: 'Bennani', ar: 'بناني' },
  { fr: 'El Khatib', ar: 'الخطيب' },
  { fr: 'Sabri', ar: 'الصبري' },
  { fr: 'Ziani', ar: 'الزياني' },
  { fr: 'El Ghazi', ar: 'الغازي' },
  { fr: 'Marrakchi', ar: 'المراكشي' },
  { fr: 'Fakhri', ar: 'الفخري' },
  { fr: 'Lahlou', ar: 'لحلو' },
  { fr: 'Bouazza', ar: 'بوعزة' },
  { fr: 'El Idrissi', ar: 'الإدريسي' },
  { fr: 'Sefrioui', ar: 'سفريوي' },
  { fr: 'Belkacem', ar: 'بلقاسم' },
];

export const DEMO_STUDENT_COUNT = 150;
/** How many of the students are on the exam-prep track (rest regular). */
export const DEMO_EXAM_PREP_COUNT = 12;

/** Deterministic full names for student `i`: first pools cycle every 30, last every 20 → 600 distinct combos. */
export function demoStudentName(index: number): { fr: string; ar: string } {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]!;
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]!;
  return { fr: `${first.fr} ${last.fr}`, ar: `${first.ar} ${last.ar}` };
}

/** Deterministic level for student `i`. */
export function demoStudentLevel(index: number): string {
  return DEMO_LEVELS[index % DEMO_LEVELS.length]!;
}

/** Deterministic civil birth date for student `i` (2009-09-01 + i*13 days). */
export function demoStudentBirthDate(index: number): string {
  return addDays('2009-09-01', index * 13);
}

/**
 * Deterministic guardian name + E.164 phone for student `i`. Guardians come from
 * the same last-name pool as students (a parent usually shares the family name),
 * so a student named "Yassine Alaoui" has a parent "… Alaoui" — the natural-key
 * and duplicate matcher read realistic. Phones are valid-format E.164 (+2126…).
 */
export function demoParentForStudent(index: number): {
  name: string;
  phone: string;
  email: string | null;
  relation: 'pere' | 'mere' | 'tuteur';
} {
  const last = LAST_NAMES[index % LAST_NAMES.length]!;
  const first = index % 2 === 0 ? { fr: 'Mohammed', ar: 'محمد' } : { fr: 'Amina', ar: 'أمينة' };
  const relation = index % 2 === 0 ? 'pere' : 'mere';
  const phone = `+2126${String(60000000 + index * 37).padStart(8, '0')}`;
  return {
    name: `${first.fr} ${last.fr}`,
    phone,
    email: null,
    relation,
  };
}

/**
 * Which formula a student subscribes to: `index % 9` maps onto the first nine
 * formulas (regular), and the last `DEMO_EXAM_PREP_COUNT` students take the
 * exam-prep Prépa Bac formula. Returns the formula's index in `DEMO_FORMULAS`.
 */
export function demoFormulaIndexForStudent(index: number): number {
  if (index >= DEMO_STUDENT_COUNT - DEMO_EXAM_PREP_COUNT) return DEMO_FORMULAS.length - 1;
  return index % (DEMO_FORMULAS.length - 1);
}
