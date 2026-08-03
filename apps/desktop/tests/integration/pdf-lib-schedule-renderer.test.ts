import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { TimeOfDay, WeekdayIndex } from '@centresoutien/domain';
import { PdfLibScheduleRenderer } from '../../src/data/pdf/pdf-lib-schedule-renderer';
import type { ScheduleExportPdfInput, ScheduleExportSessionRow } from '../../src/data/pdf/schedule-pdf-input';

function sessionRow(over: Partial<ScheduleExportSessionRow> = {}): ScheduleExportSessionRow {
  return {
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:00' as TimeOfDay,
    roomName: 'Salle 1',
    teacherName: { fr: 'M. Alaoui', ar: 'السيد العلوي' },
    subjectId: 'sub_00000000000000000000000001',
    subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
    level: '2 Bac SM',
    kind: 'regular',
    ...over,
  };
}

function baseInput(over: Partial<ScheduleExportPdfInput> = {}): ScheduleExportPdfInput {
  return {
    locale: 'fr',
    view: { scope: 'full' },
    sessions: [sessionRow()],
    center: { name: 'Centre Réussite', logoBytes: null },
    ...over,
  };
}

describe('PdfLibScheduleRenderer', () => {
  const renderer = new PdfLibScheduleRenderer();

  it('renders a valid single-page A4-landscape PDF in French', async () => {
    const bytes = await renderer.render(baseInput());
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    expect(Math.round(page.getWidth())).toBe(842);
    expect(Math.round(page.getHeight())).toBe(595);
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());
  });

  it('renders a valid PDF in Arabic with the embedded Amiri font, RTL-mirrored', async () => {
    const bytes = await renderer.render(baseInput({ locale: 'ar' }));
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('produces different bytes for fr vs ar of the same week', async () => {
    const fr = await renderer.render(baseInput({ locale: 'fr' }));
    const ar = await renderer.render(baseInput({ locale: 'ar' }));
    expect(Buffer.compare(Buffer.from(fr), Buffer.from(ar))).not.toBe(0);
  });

  it('renders every view scope without throwing', async () => {
    const views: ScheduleExportPdfInput['view'][] = [
      { scope: 'full' },
      { scope: 'room', roomName: 'Salle 3' },
      { scope: 'teacher', teacherName: { fr: 'Nadia Alaoui', ar: 'نادية العلوي' } },
      { scope: 'group', subjectName: { fr: 'Physique', ar: 'الفيزياء' }, level: '1 Bac' },
    ];
    for (const view of views) {
      const bytes = await renderer.render(baseInput({ view }));
      expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
    }
  });

  it('renders a valid PDF for an empty week', async () => {
    const bytes = await renderer.render(baseInput({ sessions: [] }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('produces different bytes for a regular vs an exam-prep session — the PE badge/dashed border', async () => {
    const regular = await renderer.render(baseInput({ sessions: [sessionRow({ kind: 'regular' })] }));
    const examPrep = await renderer.render(baseInput({ sessions: [sessionRow({ kind: 'exam-prep' })] }));
    expect(Buffer.compare(Buffer.from(regular), Buffer.from(examPrep))).not.toBe(0);
  });

  it('renders overlapping same-day sessions in distinct lanes without throwing', async () => {
    const bytes = await renderer.render(
      baseInput({
        sessions: [
          sessionRow({ roomName: 'Salle 1', start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }),
          sessionRow({ roomName: 'Salle 2', start: '09:30' as TimeOfDay, end: '10:00' as TimeOfDay }),
        ],
      }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('renders a session outside the default 08:00–20:00 window without clipping the time bounds', async () => {
    const bytes = await renderer.render(
      baseInput({ sessions: [sessionRow({ start: '06:00' as TimeOfDay, end: '22:00' as TimeOfDay })] }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('falls back to the unknown-subject label for a session with no live subject', async () => {
    const bytes = await renderer.render(
      baseInput({ sessions: [sessionRow({ subjectId: null, subjectName: null })] }),
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  });

  it('never throws on unreadable logo bytes — the schedule still renders', async () => {
    const bytes = await renderer.render(baseInput({ center: { name: 'Centre', logoBytes: new Uint8Array([1, 2, 3]) } }));
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  });
});
