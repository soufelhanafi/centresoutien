import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFArray, PDFName, PDFRawStream } from 'pdf-lib';
import type { TeacherRosterPdfInput, TeacherRosterPdfRow } from '@centresoutien/domain';
import { PdfLibTeacherRosterRenderer } from '../../src/data/pdf/pdf-lib-teacher-roster-renderer';

/** Concatenates every `<hex> Tj` show-text operator back into readable latin1 —
 *  pdf-lib emits one Tj per `drawText`, recovering a page's drawn copy. */
function decodeShowText(content: string): string {
  let text = '';
  const showText = /<([0-9A-Fa-f]+)>\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = showText.exec(content)) !== null) {
    text += Buffer.from(match[1]!, 'hex').toString('latin1');
  }
  return text;
}

function decodeStream(stream: PDFRawStream): string {
  const raw = Buffer.from(stream.getContents());
  const filter = stream.dict.get(PDFName.of('Filter'));
  const bytes = filter !== undefined && filter.toString().includes('FlateDecode') ? inflateSync(raw) : raw;
  return decodeShowText(bytes.toString('latin1'));
}

function extractPageText(doc: PDFDocument, pageIndex: number): string {
  const contents = doc.getPage(pageIndex).node.Contents();
  if (contents === undefined) return '';
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs.map((ref) => decodeStream(doc.context.lookup(ref, PDFRawStream))).join('');
}

function row(over: Partial<TeacherRosterPdfRow> = {}): TeacherRosterPdfRow {
  return {
    name: 'Amine Bennani',
    level: '2 Bac SM',
    subjects: 'Mathématiques',
    formula: 'Mathématiques + Physique',
    kind: 'Régulier',
    status: 'Inscrit(e)',
    ...over,
  };
}

function baseInput(over: Partial<TeacherRosterPdfInput> = {}): TeacherRosterPdfInput {
  return {
    teacherName: 'Prof Karim',
    generatedOn: '2026-08-21',
    filterSummary: ['Matière : Mathématiques', 'Statut : Inscrits'],
    rows: [row()],
    center: {
      name: 'Centre Réussite',
      address: '12 Rue Ibn Batouta, Casablanca',
      phone: '+212 6 00 00 00 00',
      email: 'contact@centre-reussite.ma',
      logoBytes: null,
    },
    ...over,
  };
}

describe('PdfLibTeacherRosterRenderer', () => {
  const renderer = new PdfLibTeacherRosterRenderer();

  it('renders a valid single-page PDF carrying the teacher, header and row copy', async () => {
    const bytes = await renderer.render(baseInput());
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const text = extractPageText(doc, 0);
    expect(text).toContain('Prof Karim');
    expect(text).toContain('Liste des élèves');
    expect(text).toContain('Amine Bennani');
    expect(text).toContain('Matière : Mathématiques');
    expect(text).toContain('Inscrit(e)');
  });

  it('shows the empty-state copy when there are no rows', async () => {
    const bytes = await renderer.render(baseInput({ rows: [], filterSummary: [] }));
    const doc = await PDFDocument.load(bytes);
    expect(extractPageText(doc, 0)).toContain('Aucun élève');
  });

  it('does not crash on names outside the WinAnsi charset (sanitizes instead of throwing)', async () => {
    const bytes = await renderer.render(
      baseInput({
        teacherName: 'الأستاذ كريم',
        rows: [row({ name: 'أمين بناني', subjects: 'الرياضيات' })],
      }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    // The Arabic glyphs are replaced with '?'; the export still produced a valid PDF.
    expect(extractPageText(doc, 0)).toContain('?');
  });

  it('paginates a long roster and stamps a page number on every page', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => row({ name: `Élève ${i + 1}` }));
    const bytes = await renderer.render(baseInput({ rows }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(extractPageText(doc, doc.getPageCount() - 1)).toContain('Page');
  });
});
