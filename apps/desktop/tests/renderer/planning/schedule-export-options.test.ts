import { describe, it, expect } from 'vitest';
import { scheduleExportEntityOptions } from '../../../src/renderer/lib/planning/schedule-export-options';
import type { SessionFormOptions } from '../../../src/renderer/lib/planning/session-options';

const OPTIONS: SessionFormOptions = {
  rooms: [{ id: 'r1', name: 'Salle A' }],
  teachers: [{ id: 't1', name: { fr: 'Prof A', ar: 'أستاذ أ' } }],
  groups: [
    { id: 'g1', subjectName: { fr: 'Maths', ar: 'رياضيات' }, level: '1BAC', kind: 'regular' },
    { id: 'g2', subjectName: null, level: null, kind: 'exam-prep' },
  ],
};

describe('scheduleExportEntityOptions', () => {
  it('returns nothing for the full-grid view', () => {
    expect(scheduleExportEntityOptions('full', OPTIONS, 'fr', 'Matière inconnue')).toEqual([]);
  });

  it('maps rooms by id/name', () => {
    expect(scheduleExportEntityOptions('room', OPTIONS, 'fr', 'Matière inconnue')).toEqual([
      { value: 'r1', label: 'Salle A', examPrep: false },
    ]);
  });

  it('maps teachers to their locale-appropriate bilingual name', () => {
    expect(scheduleExportEntityOptions('teacher', OPTIONS, 'ar', 'مادة غير معروفة')).toEqual([
      { value: 't1', label: 'أستاذ أ', examPrep: false },
    ]);
  });

  it('labels groups by subject + level and flags exam-prep', () => {
    expect(scheduleExportEntityOptions('group', OPTIONS, 'fr', 'Matière inconnue')).toEqual([
      { value: 'g1', label: 'Maths — 1BAC', examPrep: false },
      { value: 'g2', label: 'Matière inconnue', examPrep: true },
    ]);
  });
});
