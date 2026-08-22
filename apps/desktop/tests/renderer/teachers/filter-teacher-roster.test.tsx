import { describe, it, expect } from 'vitest';
import type { TeacherRosterEntryView } from '../../../src/renderer/lib/teachers/teacher-roster-view';
import {
  filterTeacherRoster,
  teacherRosterGroupFacets,
  teacherRosterSubjectFacets,
} from '../../../src/renderer/lib/teachers/filter-teacher-roster';

const MATH = { subjectId: 'sub_math', name: { fr: 'Mathématiques', ar: 'الرياضيات' } };
const PHYS = { subjectId: 'sub_phys', name: { fr: 'Physique', ar: 'الفيزياء' } };

function entry(over: Partial<TeacherRosterEntryView> = {}): TeacherRosterEntryView {
  return {
    studentId: 'stu_1',
    name: { fr: 'Amine Bennani', ar: 'أمين بناني' },
    level: '2 Bac',
    groups: [{ groupId: 'grp_1', subjectId: MATH.subjectId, subjectName: MATH.name, level: '2 Bac', kind: 'regular' }],
    subjects: [MATH],
    kinds: ['regular'],
    formulaLabel: { fr: 'Mathématiques', ar: 'الرياضيات' },
    status: 'active',
    leftMonth: null,
    ...over,
  };
}

describe('filterTeacherRoster', () => {
  it('defaults to all when the filter is empty (status all)', () => {
    const roster = [entry({ studentId: 'a' }), entry({ studentId: 'b', status: 'left', leftMonth: '2026-09' })];
    const result = filterTeacherRoster(roster, { subjectId: null, groupId: null, nameQuery: '', status: 'all' });
    expect(result).toHaveLength(2);
  });

  it('filters by status', () => {
    const roster = [entry({ studentId: 'a' }), entry({ studentId: 'b', status: 'left', leftMonth: '2026-09' })];
    const active = filterTeacherRoster(roster, { subjectId: null, groupId: null, nameQuery: '', status: 'active' });
    expect(active.map((e) => e.studentId)).toEqual(['a']);
    const left = filterTeacherRoster(roster, { subjectId: null, groupId: null, nameQuery: '', status: 'left' });
    expect(left.map((e) => e.studentId)).toEqual(['b']);
  });

  it('keeps a multi-subject student when filtering by one of their subjects', () => {
    const multi = entry({ subjects: [MATH, PHYS] });
    const result = filterTeacherRoster([multi], {
      subjectId: PHYS.subjectId,
      groupId: null,
      nameQuery: '',
      status: 'active',
    });
    expect(result).toHaveLength(1);
  });

  it('filters by group and by name (case-insensitive, composing with AND)', () => {
    const roster = [
      entry({ studentId: 'a', name: { fr: 'Amine Bennani', ar: 'أمين' } }),
      entry({ studentId: 'b', name: { fr: 'Zineb Idrissi', ar: 'زينب' }, groups: [{ groupId: 'grp_2', subjectId: MATH.subjectId, subjectName: MATH.name, level: '1 Bac', kind: 'regular' }] }),
    ];
    const byGroup = filterTeacherRoster(roster, { subjectId: null, groupId: 'grp_1', nameQuery: '', status: 'active' });
    expect(byGroup.map((e) => e.studentId)).toEqual(['a']);
    const byName = filterTeacherRoster(roster, { subjectId: null, groupId: null, nameQuery: 'zineb', status: 'active' });
    expect(byName.map((e) => e.studentId)).toEqual(['b']);
  });
});

describe('teacherRosterSubjectFacets / teacherRosterGroupFacets', () => {
  it('returns distinct subjects sorted by display name (FR UI)', () => {
    const facets = teacherRosterSubjectFacets([entry({ subjects: [PHYS, MATH] }), entry({ subjects: [MATH] })], 'fr');
    expect(facets.map((f) => f.label)).toEqual(['Mathématiques', 'Physique']);
  });

  it('localizes the display label to Arabic while keeping labelFr French (for the PDF)', () => {
    const facets = teacherRosterSubjectFacets([entry({ subjects: [MATH] })], 'ar');
    expect(facets[0]).toMatchObject({ id: MATH.subjectId, label: 'الرياضيات', labelFr: 'Mathématiques' });
  });

  it('labels a group as "subject — level", distinctly per group id', () => {
    const roster = [
      entry({ groups: [{ groupId: 'grp_1', subjectId: MATH.subjectId, subjectName: MATH.name, level: '2 Bac', kind: 'regular' }] }),
      entry({ groups: [{ groupId: 'grp_2', subjectId: MATH.subjectId, subjectName: MATH.name, level: '1 Bac', kind: 'regular' }] }),
    ];
    const facets = teacherRosterGroupFacets(roster, 'fr');
    expect(facets).toEqual([
      { id: 'grp_2', label: 'Mathématiques — 1 Bac', labelFr: 'Mathématiques — 1 Bac' },
      { id: 'grp_1', label: 'Mathématiques — 2 Bac', labelFr: 'Mathématiques — 2 Bac' },
    ]);
  });
});
