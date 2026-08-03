import { describe, it, expect } from 'vitest';
import { schedulePdfLabels } from '../../../src/data/pdf/schedule-pdf-labels';
import { scheduleViewTitle } from '../../../src/data/pdf/schedule-pdf-view-title';
import type { ScheduleExportViewFilter } from '../../../src/data/pdf/schedule-pdf-input';

describe('scheduleViewTitle', () => {
  const fr = schedulePdfLabels('fr');
  const ar = schedulePdfLabels('ar');

  it('renders the full-center title for the full scope', () => {
    const view: ScheduleExportViewFilter = { scope: 'full' };
    expect(scheduleViewTitle(view, fr, 'fr')).toBe(fr.viewFull);
  });

  it('renders "prefix — room name" for the room scope', () => {
    const view: ScheduleExportViewFilter = { scope: 'room', roomName: 'Salle 3' };
    expect(scheduleViewTitle(view, fr, 'fr')).toBe(`${fr.viewRoomPrefix} — Salle 3`);
  });

  it('picks the locale-matching teacher name for the teacher scope', () => {
    const view: ScheduleExportViewFilter = {
      scope: 'teacher',
      teacherName: { fr: 'Nadia Alaoui', ar: 'نادية العلوي' },
    };
    expect(scheduleViewTitle(view, fr, 'fr')).toBe(`${fr.viewTeacherPrefix} — Nadia Alaoui`);
    expect(scheduleViewTitle(view, ar, 'ar')).toBe(`${ar.viewTeacherPrefix} — نادية العلوي`);
  });

  it('appends the level in parentheses for a group with a known subject and level', () => {
    const view: ScheduleExportViewFilter = {
      scope: 'group',
      subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
      level: '2 Bac SM',
    };
    expect(scheduleViewTitle(view, fr, 'fr')).toBe(`${fr.viewGroupPrefix} — Mathématiques (2 Bac SM)`);
  });

  it('falls back to the unknown-subject label when the group has no live subject', () => {
    const view: ScheduleExportViewFilter = { scope: 'group', subjectName: null, level: null };
    expect(scheduleViewTitle(view, fr, 'fr')).toBe(`${fr.viewGroupPrefix} — ${fr.unknownSubject}`);
  });
});
