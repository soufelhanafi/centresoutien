import { describe, it, expect } from 'vitest';
import { resolveWorkbookReferences, type ClassifiedRow } from '../../../src/backup/resolve-references';
import type { BackupSheetName } from '../../../src/backup/backup-workbook';
import { validId } from './helpers';

function classified(row: ClassifiedRow['row'], status: ClassifiedRow['status'], reason: string | null = null): ClassifiedRow {
  return { row, status, reason };
}

function processed(entries: Partial<Record<BackupSheetName, ClassifiedRow[]>>): Map<BackupSheetName, ClassifiedRow[]> {
  return new Map(Object.entries(entries) as [BackupSheetName, ClassifiedRow[]][]);
}

function known(entries: Partial<Record<BackupSheetName, string[]>>): Map<BackupSheetName, Set<string>> {
  return new Map(Object.entries(entries).map(([sheet, ids]) => [sheet as BackupSheetName, new Set(ids)]));
}

describe('resolveWorkbookReferences — catalog references (auto-create placeholder)', () => {
  it('plans a placeholder for a missing single catalog reference (student.niveauId)', () => {
    const niveauId = validId('niv');
    const studentRow = { id: validId('stu'), niveauId };
    const result = resolveWorkbookReferences(
      processed({ students: [classified(studentRow, 'created')] }),
      known({}),
    );

    expect(result.placeholders).toEqual([{ sheet: 'niveaux', id: niveauId }]);
    // the referencing row is untouched — the reference now resolves via the placeholder
    expect(result.outcomesBySheet.get('students')![0]).toEqual({
      row: studentRow,
      droppedLinkReasons: [],
      brokenLinkReason: null,
    });
  });

  it('plans one placeholder per missing id in a comma-joined list (teacher.niveauIds)', () => {
    const existingNiveau = validId('niv', '01HWAAAAAAAAAAAAAAAAAAAAA1');
    const missingNiveau = validId('niv', '01HWAAAAAAAAAAAAAAAAAAAAA2');
    const teacherRow = { id: validId('tch'), niveauIds: `${existingNiveau},${missingNiveau}` };

    const result = resolveWorkbookReferences(
      processed({ teachers: [classified(teacherRow, 'created')] }),
      known({ niveaux: [existingNiveau] }),
    );

    expect(result.placeholders).toEqual([{ sheet: 'niveaux', id: missingNiveau }]);
  });

  it('dedupes a placeholder referenced by more than one row', () => {
    const parentId = validId('prt');
    const rows: ClassifiedRow[] = [
      classified({ id: validId('stu', '01HWAAAAAAAAAAAAAAAAAAAAA1'), guardianIds: parentId }, 'created'),
      classified({ id: validId('stu', '01HWAAAAAAAAAAAAAAAAAAAAA2'), guardianIds: parentId }, 'created'),
    ];

    const result = resolveWorkbookReferences(processed({ students: rows }), known({}));
    expect(result.placeholders).toEqual([{ sheet: 'parents', id: parentId }]);
  });

  it('does not plan a placeholder for a reference that already exists', () => {
    const niveauId = validId('niv');
    const result = resolveWorkbookReferences(
      processed({ students: [classified({ id: validId('stu'), niveauId }, 'created')] }),
      known({ niveaux: [niveauId] }),
    );
    expect(result.placeholders).toEqual([]);
  });

  it('leaves a malformed reference id untouched (no placeholder, no adjustment)', () => {
    const studentRow = { id: validId('stu'), niveauId: 'not-an-id' };
    const result = resolveWorkbookReferences(
      processed({ students: [classified(studentRow, 'created')] }),
      known({}),
    );
    expect(result.placeholders).toEqual([]);
    expect(result.outcomesBySheet.get('students')![0]!.row).toBe(studentRow);
  });

  it('ignores references on rows that are duplicate or invalid — no point resolving a skipped row', () => {
    const niveauId = validId('niv');
    const result = resolveWorkbookReferences(
      processed({ students: [classified({ id: validId('stu'), niveauId }, 'duplicate', 'natural-key-exists')] }),
      known({}),
    );
    expect(result.placeholders).toEqual([]);
  });
});

describe('resolveWorkbookReferences — link references (drop or break)', () => {
  it('drops a missing nullable link to null and notes it (weekly-recurring-sessions.groupId)', () => {
    const groupId = validId('grp');
    const sessionRow = { id: validId('wrs'), groupId };
    const result = resolveWorkbookReferences(
      processed({ 'weekly-recurring-sessions': [classified(sessionRow, 'created')] }),
      known({}),
    );

    const outcome = result.outcomesBySheet.get('weekly-recurring-sessions')![0]!;
    expect(outcome.row).toEqual({ id: sessionRow.id, groupId: null });
    expect(outcome.row).not.toBe(sessionRow); // original row left untouched
    expect(outcome.droppedLinkReasons).toEqual(['dropped-missing-link:groupId']);
    expect(outcome.brokenLinkReason).toBeNull();
    expect(result.placeholders).toEqual([]); // groups is a `link`, never auto-created
  });

  it('forces the row invalid when a required link is missing (student-subscriptions.studentId)', () => {
    const studentId = validId('stu');
    const subscriptionRow = { id: validId('sbs'), studentId };
    const result = resolveWorkbookReferences(
      processed({ 'student-subscriptions': [classified(subscriptionRow, 'created')] }),
      known({}),
    );

    const outcome = result.outcomesBySheet.get('student-subscriptions')![0]!;
    expect(outcome.brokenLinkReason).toBe('missing-link:studentId');
  });

  it('joins more than one broken required link with ";"', () => {
    const invoiceLineRow = { id: validId('invl'), invoiceId: validId('inv'), formulaId: validId('fml') };
    const result = resolveWorkbookReferences(
      processed({ 'invoice-lines': [classified(invoiceLineRow, 'created')] }),
      known({}),
    );
    const outcome = result.outcomesBySheet.get('invoice-lines')![0]!;
    expect(outcome.brokenLinkReason).toBe('missing-link:invoiceId;missing-link:formulaId');
  });

  it('does not touch a link that already resolves', () => {
    const groupId = validId('grp');
    const sessionRow = { id: validId('wrs'), groupId };
    const result = resolveWorkbookReferences(
      processed({ 'weekly-recurring-sessions': [classified(sessionRow, 'created')] }),
      known({ groups: [groupId] }),
    );
    const outcome = result.outcomesBySheet.get('weekly-recurring-sessions')![0]!;
    expect(outcome.row).toBe(sessionRow);
    expect(outcome.droppedLinkReasons).toEqual([]);
    expect(outcome.brokenLinkReason).toBeNull();
  });
});
