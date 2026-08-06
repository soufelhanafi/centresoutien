import { describe, it, expect } from 'vitest';
import { DuplicateMatcher, type DuplicateMatchSource } from '../../../src/sync/duplicate-matcher';
import type { Parent, ParentId } from '../../../src/entities/parent';
import type { Student } from '../../../src/entities/student';
import type { Teacher } from '../../../src/entities/teacher';
import type { CenterCode, EntityId } from '../../../src/value-objects/ids';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';

/**
 * Duplicate detection at sync time (SOU-80 §4): parents/teachers anchor on the
 * E.164 phone, students on normalized name + guardian. Confidence tiers —
 * exact / fuzzy / none — and the parents-before-students dependency order.
 * The matcher only DETECTS; merging is the Merge use cases' job (SOU-92).
 */

const CENTER = 'CS-CASA-001' as CenterCode;

function parent(id: string, name: string, phone: string): Parent {
  return {
    id: id as Parent['id'],
    naturalKey: '',
    name,
    phone: phone as PhoneNumber,
    email: null,
    relation: 'father',
    whatsappOptIn: false,
  } as Parent;
}

function teacher(id: string, name: string, phone: string): Teacher {
  return {
    id: id as Teacher['id'],
    naturalKey: '',
    name: { fr: name, ar: name },
    phone: phone as PhoneNumber,
    cin: null,
    email: null,
    subjectIds: [],
    active: true,
  } as Teacher;
}

function student(id: string, name: string, birthDate: string, guardianIds: string[]): Student {
  return {
    id: id as Student['id'],
    naturalKey: '',
    name: { fr: name, ar: name },
    birthDate,
    level: '2 Bac',
    school: null,
    notes: null,
    guardianIds: guardianIds as ParentId[],
  } as Student;
}

function source(overrides: Partial<DuplicateMatchSource>): DuplicateMatchSource {
  return {
    findParentsByPhone: () => [],
    findTeachersByPhone: () => [],
    findStudentsByName: () => [],
    ...overrides,
  };
}

const asEntity = (id: string) => id as EntityId;
const SELF = asEntity('none');

describe('DuplicateMatcher — parents (E.164 phone anchor)', () => {
  it('same normalized name + same phone → exact match (the naturalKey collision)', () => {
    const matcher = new DuplicateMatcher(
      source({
        findParentsByPhone: () => [parent('prt_A', 'Mohamed El Amrani', '+212600000001')],
      }),
    );
    const matches = matcher.match({
      entityType: 'parents',
      centerCode: CENTER,
      entity: { id: 'prt_B', name: 'MOHAMED EL AMRANI', phone: '+212600000001' },
      selfId: SELF,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ tier: 'exact', candidateId: asEntity('prt_A'), reason: 'same-name-phone' });
  });

  it('shared phone but different name → fuzzy flag, never auto-merge', () => {
    const matcher = new DuplicateMatcher(
      source({ findParentsByPhone: () => [parent('prt_A', 'Mohamed El Amrani', '+212600000001')] }),
    );
    const matches = matcher.match({
      entityType: 'parents',
      centerCode: CENTER,
      entity: { id: 'prt_B', name: 'Khadija El Amrani', phone: '+212600000001' },
      selfId: SELF,
    });

    expect(matches[0]).toEqual({ tier: 'fuzzy', candidateId: asEntity('prt_A'), reason: 'shared-phone' });
  });

  it('ignores the record itself when it is already local', () => {
    const matcher = new DuplicateMatcher(
      source({ findParentsByPhone: () => [parent('prt_A', 'Mohamed El Amrani', '+212600000001')] }),
    );
    const matches = matcher.match({
      entityType: 'parents',
      centerCode: CENTER,
      entity: { id: 'prt_A', name: 'Mohamed El Amrani', phone: '+212600000001' },
      selfId: asEntity('prt_A'),
    });

    expect(matches).toHaveLength(0);
  });

  it('teachers use the same phone anchor as parents', () => {
    const matcher = new DuplicateMatcher(
      source({ findTeachersByPhone: () => [teacher('tch_A', 'Salma Bennani', '+212700000002')] }),
    );
    // The teacher helper stamps name as `{ fr, ar }`, so a matching inbound must
    // use the same bilingual shape — a raw String() would have "matched" any two
    // records ("[object Object]"), which is exactly the bug the regression test
    // below guards against.
    const matches = matcher.match({
      entityType: 'teachers',
      centerCode: CENTER,
      entity: { id: 'tch_B', name: { fr: 'Salma Bennani', ar: 'Salma Bennani' }, phone: '+212700000002' },
      selfId: SELF,
    });

    expect(matches[0]).toEqual({ tier: 'exact', candidateId: asEntity('tch_A'), reason: 'same-name-phone' });
  });

  it('two teachers sharing a phone but with DIFFERENT names → fuzzy, never exact', () => {
    // Regression (SOU-80 review): teacher `name` is a `{ fr, ar }` object, so a
    // raw String() would be "[object Object]" on both sides and collapse every
    // shared-phone pair into an "exact" match. The bilingual normalization must
    // keep the shared-phone fuzzy tier reachable.
    const matcher = new DuplicateMatcher(
      source({ findTeachersByPhone: () => [teacher('tch_A', 'Salma Bennani', '+212700000002')] }),
    );
    const matches = matcher.match({
      entityType: 'teachers',
      centerCode: CENTER,
      entity: { id: 'tch_B', name: { fr: 'Karim', ar: 'كريم' }, phone: '+212700000002' },
      selfId: SELF,
    });

    expect(matches[0]).toEqual({ tier: 'fuzzy', candidateId: asEntity('tch_A'), reason: 'shared-phone' });
  });
});

describe('DuplicateMatcher — students (name + guardian)', () => {
  it('same name, different guardians, different birth date → two real students, NO flag', () => {
    const matcher = new DuplicateMatcher(
      source({
        findStudentsByName: () => [
          student('stu_A', 'Yassine Alaoui', '2010-01-15', ['prt_A']),
        ],
      }),
    );
    const matches = matcher.match({
      entityType: 'students',
      centerCode: CENTER,
      entity: { id: 'stu_B', name: { fr: 'Yassine', ar: 'ياسين' }, birthDate: '2011-06-02', guardianIds: ['prt_B'] },
      selfId: SELF,
    });

    expect(matches).toHaveLength(0);
  });

  it('same name + shared guardian → exact (the parent discriminates)', () => {
    const matcher = new DuplicateMatcher(
      source({
        findStudentsByName: () => [student('stu_A', 'Yassine Alaoui', '2010-01-15', ['prt_A'])],
      }),
    );
    const matches = matcher.match({
      entityType: 'students',
      centerCode: CENTER,
      entity: { id: 'stu_B', name: { fr: 'Yassine', ar: 'ياسين' }, birthDate: '2010-01-15', guardianIds: ['prt_A'] },
      selfId: SELF,
    });

    expect(matches[0]).toEqual({ tier: 'exact', candidateId: asEntity('stu_A'), reason: 'shared-guardian' });
  });

  it('same name + same birth date, DIFFERENT guardians (separated family) → fuzzy flag', () => {
    const matcher = new DuplicateMatcher(
      source({
        findStudentsByName: () => [student('stu_A', 'Yassine Alaoui', '2010-01-15', ['prt_A'])],
      }),
    );
    const matches = matcher.match({
      entityType: 'students',
      centerCode: CENTER,
      entity: { id: 'stu_B', name: { fr: 'Yassine', ar: 'ياسين' }, birthDate: '2010-01-15', guardianIds: ['prt_B'] },
      selfId: SELF,
    });

    expect(matches[0]).toEqual({ tier: 'fuzzy', candidateId: asEntity('stu_A'), reason: 'separated-family' });
  });

  it('non-people entity types are ignored', () => {
    const matcher = new DuplicateMatcher(source());
    const matches = matcher.match({
      entityType: 'rooms',
      centerCode: CENTER,
      entity: { id: 'rom_1', name: 'Salle 2' },
      selfId: SELF,
    });

    expect(matches).toHaveLength(0);
  });
});

describe('DuplicateMatcher — parents-before-students ordering (SOU-92)', () => {
  it('detects a parent duplicate independently of any student, before students are ever matched', () => {
    // A second laptop created the same guardian again. The parent is the anchor
    // of the hierarchy: its duplicate is surfaced FIRST, while the student layer
    // has nothing to match yet (guardians settle before dependents).
    const matcher = new DuplicateMatcher(
      source({ findParentsByPhone: () => [parent('prt_A', 'Mohamed', '+212600000001')] }),
    );
    const parentMatches = matcher.match({
      entityType: 'parents',
      centerCode: CENTER,
      entity: { id: 'prt_B', name: 'Mohamed', phone: '+212600000001' },
      selfId: SELF,
    });
    expect(parentMatches[0]).toEqual({ tier: 'exact', candidateId: asEntity('prt_A'), reason: 'same-name-phone' });

    // A student is only matchable on a SETTLED guardian id. Before the parent
    // merge above folds prt_B into prt_A, a same-name student carrying prt_B
    // cannot match the local one carrying prt_A as an EXACT duplicate — the same
    // birth date only earns the separated-family fuzzy flag, never exact.
    const matcher2 = new DuplicateMatcher(
      source({
        findStudentsByName: () => [student('stu_A', 'Yassine Alaoui', '2010-01-15', ['prt_A'])],
      }),
    );
    const unmatched = matcher2.match({
      entityType: 'students',
      centerCode: CENTER,
      entity: {
        id: 'stu_B',
        name: { fr: 'Yassine', ar: 'ياسين' },
        birthDate: '2010-01-15',
        guardianIds: ['prt_B'],
      },
      selfId: SELF,
    });
    expect(unmatched[0]).toEqual({
      tier: 'fuzzy',
      candidateId: asEntity('stu_A'),
      reason: 'separated-family',
    });

    // Once the parent merge lands and both records carry prt_A, the same student
    // becomes an exact match — parents-first ordering is what makes this safe.
    const matcher3 = new DuplicateMatcher(
      source({
        findStudentsByName: () => [student('stu_A', 'Yassine Alaoui', '2010-01-15', ['prt_A'])],
      }),
    );
    const matched = matcher3.match({
      entityType: 'students',
      centerCode: CENTER,
      entity: {
        id: 'stu_C',
        name: { fr: 'Yassine', ar: 'ياسين' },
        birthDate: '2010-01-15',
        guardianIds: ['prt_A'],
      },
      selfId: SELF,
    });
    expect(matched[0]).toEqual({ tier: 'exact', candidateId: asEntity('stu_A'), reason: 'shared-guardian' });
  });

  it('Arabic↔Latin transliteration reaches the matcher — "محمد" and "Mohamed" collide exactly', () => {
    const matcher = new DuplicateMatcher(
      source({ findParentsByPhone: () => [parent('prt_A', 'Mohamed', '+212600000001')] }),
    );
    const matches = matcher.match({
      entityType: 'parents',
      centerCode: CENTER,
      entity: { id: 'prt_B', name: 'محمد', phone: '+212600000001' },
      selfId: SELF,
    });
    expect(matches[0]).toEqual({ tier: 'exact', candidateId: asEntity('prt_A'), reason: 'same-name-phone' });
  });
});
