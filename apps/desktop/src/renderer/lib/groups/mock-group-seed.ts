import type { GroupInput } from '@centresoutien/domain';
import type { RoomOption, StudentOption, SubjectOption, TeacherOption } from './group-view';

/** A seeded group row in the mock store (mutable so create/edit/archive persist). */
export type MockGroup = {
  id: string;
  subjectId: string;
  roomId: string;
  teacherId: string | null;
  level: string;
  capacity: number;
  kind: GroupInput['kind'];
  archived: boolean;
};

/** A seeded enrollment in the mock store (mutable so enroll/remove persist). */
export type MockEnrollment = { id: string; groupId: string; studentId: string };

/**
 * Seed IDs are real `{prefix}_{ULID}` values, not human-readable slugs: the
 * create/edit form validates `subjectId`/`roomId` with the domain
 * `groupInputSchema`, which requires `hasIdPrefix(value, prefix)` — i.e. a valid
 * 26-char ULID after the prefix. Slugs like `sub_math` fail that check and get
 * rejected as `invalid-id`, so a group could never be created or edited through
 * the mock. Named constants keep the seed self-documenting while honoring the
 * contract; the real read model (SOU-127) will supply equally valid IDs.
 */
const ID = {
  sub: {
    math: 'sub_PFTAQ6Y5VVR0HRC2HFJPME6PB2',
    phys: 'sub_APDH5TB98QJM1GGGGCQ80NDN8V',
    svt: 'sub_GW8R64MRRBKN10YYF4S103SSVS',
    fr: 'sub_EASCCBMENZEFQ7DDPWD5C60QED',
  },
  rom: {
    r1: 'rom_CS0J44ZDZBH6XRCVYPHZ9M6V2Q',
    r2: 'rom_135BX0RFG730GH8VT75WMYPYV7',
    r3: 'rom_2J2516BT2KF0QMFYSKASJY3TDC',
  },
  tch: {
    t1: 'tch_ERRHFZN8EA86BCJR4E6BQ1X5SE',
    t2: 'tch_6JYPKDW9WZRCK641A70H6EGMQD',
    t3: 'tch_9E4F6DMMWZ4NC1CJG9N1RV7KM2',
  },
  stu: {
    s1: 'stu_1P0AH05X60N85HP4K4Y4F3KZX4',
    s2: 'stu_61B3MYRS335ZBXXQZBS1N1SRNN',
    s3: 'stu_7GY3JMRXKW3EK3RP2XGN7TM0RB',
    s4: 'stu_KMM6T14Y17Q2AZMPN9DNPZB0CX',
    s5: 'stu_HPQ3BWDEZN05S2GVB0SQPBKKCZ',
    s6: 'stu_HPAFGSXT9RVP0G7SF50TGJ7X8H',
  },
  grp: {
    g1: 'grp_23T9FRRTRH9V6FTR1X483AAEY5',
    g2: 'grp_GATVJK4MY2SH51EFKS11NFTPY9',
    g3: 'grp_61FZ28RK3JB8PJ7HH5E3308ZFV',
    g4: 'grp_9SD6XR8YQSR1RW08WJ7VKE398A',
    g5: 'grp_B8R4EFT9SVVG6QWQCMVDZ00J09',
  },
  enr: {
    e1: 'enr_4Q6QEJ12PW3KV3A7QZDSC34T0Z',
    e2: 'enr_C5XGM9RK9FK64WASA7VCG6K7JG',
    e3: 'enr_1B4G1RXDRGDCHHXRM59D57NJJ2',
    e4: 'enr_EK2PA2REM9AJ26QXAPEY8V7ZMB',
    e5: 'enr_WG6R3150BNVBTF4ZDJDKCWY45G',
    e6: 'enr_ATD1N5KVHVACX820ZDNEBWK62D',
    e7: 'enr_EY9WNKQ6M1FYFHS05H8G4VQWTZ',
  },
} as const;

export const SUBJECTS: readonly SubjectOption[] = [
  { id: ID.sub.math, name: { fr: 'Mathématiques', ar: 'الرياضيات' } },
  { id: ID.sub.phys, name: { fr: 'Physique-Chimie', ar: 'الفيزياء والكيمياء' } },
  { id: ID.sub.svt, name: { fr: 'SVT', ar: 'علوم الحياة والأرض' } },
  { id: ID.sub.fr, name: { fr: 'Français', ar: 'الفرنسية' } },
];

export const ROOMS: readonly RoomOption[] = [
  { id: ID.rom.r1, name: 'Salle 1' },
  { id: ID.rom.r2, name: 'Salle 2' },
  { id: ID.rom.r3, name: 'Salle 3' },
];

export const TEACHERS: readonly TeacherOption[] = [
  { id: ID.tch.t1, name: { fr: 'M. Alaoui', ar: 'الأستاذ العلوي' } },
  { id: ID.tch.t2, name: { fr: 'Mme Bennani', ar: 'الأستاذة بنّاني' } },
  { id: ID.tch.t3, name: { fr: 'M. Idrissi', ar: 'الأستاذ الإدريسي' } },
];

export const STUDENTS: readonly StudentOption[] = [
  { id: ID.stu.s1, name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' }, level: '2 Bac SM' },
  { id: ID.stu.s2, name: { fr: 'Salma Bennani', ar: 'سلمى بنّاني' }, level: '2 Bac SM' },
  { id: ID.stu.s3, name: { fr: 'Omar Idrissi', ar: 'عمر الإدريسي' }, level: '2 Bac SM' },
  { id: ID.stu.s4, name: { fr: 'Nada Chraibi', ar: 'ندى الشرايبي' }, level: '1 Bac SE' },
  { id: ID.stu.s5, name: { fr: 'Anas Tazi', ar: 'أنس التازي' }, level: '1 Bac SE' },
  { id: ID.stu.s6, name: { fr: 'Lina Fassi', ar: 'لينا الفاسي' }, level: '3AC' },
];

/**
 * The seed covers the states the UI must handle: several subjects, an
 * unassigned-teacher group, an exam-prep group (kind badge + filter), a full
 * group (fill = capacity), an empty-roster group, and an archived group.
 */
export const seedGroups: MockGroup[] = [
  { id: ID.grp.g1, subjectId: ID.sub.math, roomId: ID.rom.r1, teacherId: ID.tch.t1, level: '2 Bac SM', capacity: 20, kind: 'regular', archived: false },
  { id: ID.grp.g2, subjectId: ID.sub.phys, roomId: ID.rom.r2, teacherId: ID.tch.t2, level: '1 Bac SE', capacity: 3, kind: 'regular', archived: false },
  { id: ID.grp.g3, subjectId: ID.sub.svt, roomId: ID.rom.r3, teacherId: null, level: '3AC', capacity: 12, kind: 'regular', archived: false },
  { id: ID.grp.g4, subjectId: ID.sub.math, roomId: ID.rom.r1, teacherId: ID.tch.t1, level: '2 Bac SM', capacity: 10, kind: 'exam-prep', archived: false },
  { id: ID.grp.g5, subjectId: ID.sub.fr, roomId: ID.rom.r2, teacherId: ID.tch.t3, level: '1 Bac SE', capacity: 18, kind: 'regular', archived: true },
];

export const seedEnrollments: MockEnrollment[] = [
  { id: ID.enr.e1, groupId: ID.grp.g1, studentId: ID.stu.s1 },
  { id: ID.enr.e2, groupId: ID.grp.g1, studentId: ID.stu.s2 },
  { id: ID.enr.e3, groupId: ID.grp.g1, studentId: ID.stu.s3 },
  { id: ID.enr.e4, groupId: ID.grp.g2, studentId: ID.stu.s4 },
  { id: ID.enr.e5, groupId: ID.grp.g2, studentId: ID.stu.s5 },
  { id: ID.enr.e6, groupId: ID.grp.g2, studentId: ID.stu.s6 },
  { id: ID.enr.e7, groupId: ID.grp.g4, studentId: ID.stu.s1 },
];
