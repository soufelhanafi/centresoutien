import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { Clock, DeviceId } from '@centresoutien/domain';
import { ExportBackup, PreviewImportBackup, PlanPolicy, PLANS } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteBackupStore } from '../../src/data/sqlite/repositories/backup-store';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import { ExcelBackupAdapter } from '../../src/data/excel/backup-excel-adapter';

/**
 * The exact scenario a real center reports as "import fails with an
 * unspecified error": export the whole center to Excel, then re-import that
 * SAME file back into the SAME center. Every other backup-excel integration
 * test either round-trips a single sheet in isolation or applies rows
 * directly through `BackupStore.applyRows`, bypassing `classifyImportRow` —
 * so none of them exercise the real preview path against a fully-populated,
 * cross-referencing center. This test seeds one realistic row per entity
 * (touching every foreign key a center actually has) and asserts the preview
 * finds zero `invalid` rows.
 */

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001';
const DEVICE = 'dev_test' as DeviceId;
const TEST_CLOCK: Clock = { now: () => new Date('2026-08-01T10:00:00.000Z') };

let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-backup-excel-reimport-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const ENVELOPE = "'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0";

/** One self-consistent row per entity table — every foreign key a real center has. */
function seedFullCenter(centerCode: string): void {
  const ROOM = 'rom_00000000000000000000000001';
  const PARENT = 'prt_00000000000000000000000001';
  const STUDENT = 'stu_00000000000000000000000001';
  const TEACHER = 'tch_00000000000000000000000001';
  const SUBJECT = 'sub_00000000000000000000000001';
  const NIVEAU = 'niv_00000000000000000000000001';
  const GROUP = 'grp_00000000000000000000000001';
  const FORMULA = 'fml_00000000000000000000000001';
  const SUBSCRIPTION = 'sbs_00000000000000000000000001';
  const ENROLLMENT = 'enr_00000000000000000000000001';
  const WRS = 'wrs_00000000000000000000000001';
  const SESSION = 'ses_00000000000000000000000001';
  const INVOICE = 'inv_00000000000000000000000001';
  const INVOICE_LINE = 'invl_0000000000000000000000001';
  const PAYMENT = 'pay_00000000000000000000000001';
  const HOLIDAY = 'hol_00000000000000000000000001';
  const CHO = 'cho_00000000000000000000000001';
  const TAV = 'tav_00000000000000000000000001';
  const TAE = 'tae_00000000000000000000000001';

  db.prepare(
    `INSERT INTO rooms (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name, capacity, active)
     VALUES (?, ?, ${ENVELOPE}, 'Salle A', 10, 1)`,
  ).run(ROOM, centerCode);
  db.prepare(
    `INSERT INTO parents (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, natural_key, name, phone, email, relation, whatsapp_opt_in)
     VALUES (?, ?, ${ENVELOPE}, ?, 'Papa', '+212600000000', NULL, 'pere', 0)`,
  ).run(PARENT, centerCode, `${centerCode}::papa::+212600000000`);
  db.prepare(
    `INSERT INTO niveaux (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name_fr, name_ar, code, category, active)
     VALUES (?, ?, ${ENVELOPE}, '3ème Année Collège', 'السنة الثالثة إعدادي', '3AC', 'college', 1)`,
  ).run(NIVEAU, centerCode);
  db.prepare(
    `INSERT INTO students (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, natural_key, name_fr, name_ar, birth_date, level, niveau_id, school, notes, guardian_ids)
     VALUES (?, ?, ${ENVELOPE}, ?, 'Yassine', 'ياسين', '2010-01-01', '3AC', ?, NULL, NULL, ?)`,
  ).run(STUDENT, centerCode, `${centerCode}::yassine::2010-01-01`, NIVEAU, JSON.stringify([PARENT]));
  db.prepare(
    `INSERT INTO subjects (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name_fr, name_ar, active)
     VALUES (?, ?, ${ENVELOPE}, 'Mathématiques', 'الرياضيات', 1)`,
  ).run(SUBJECT, centerCode);
  db.prepare(
    `INSERT INTO teachers (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, natural_key, name_fr, name_ar, cin, phone, email, subject_ids, niveau_ids, active)
     VALUES (?, ?, ${ENVELOPE}, ?, 'Prof', 'أستاذ', NULL, '+212600000001', NULL, ?, ?, 1)`,
  ).run(TEACHER, centerCode, `${centerCode}::prof::+212600000001`, JSON.stringify([SUBJECT]), JSON.stringify([NIVEAU]));
  db.prepare(
    `INSERT INTO groups (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, subject_id, teacher_id, niveau_id, level, capacity, kind, active)
     VALUES (?, ?, ${ENVELOPE}, ?, ?, ?, '3AC', 15, 'regular', 1)`,
  ).run(GROUP, centerCode, SUBJECT, TEACHER, NIVEAU);
  db.prepare(
    `INSERT INTO formulas (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name_fr, name_ar, subject_ids, price_mad, kind, is_immutable, active)
     VALUES (?, ?, ${ENVELOPE}, 'Math seul', 'الرياضيات فقط', ?, 20000, 'regular', 1, 1)`,
  ).run(FORMULA, centerCode, JSON.stringify([SUBJECT]));
  db.prepare(
    `INSERT INTO student_subscriptions (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, student_id, formula_id, kind, subject_ids, start_month, end_month)
     VALUES (?, ?, ${ENVELOPE}, ?, ?, 'regular', ?, '2026-01', NULL)`,
  ).run(SUBSCRIPTION, centerCode, STUDENT, FORMULA, JSON.stringify([SUBJECT]));
  db.prepare(
    `INSERT INTO enrollments (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, student_id, group_id, start_month, end_month)
     VALUES (?, ?, ${ENVELOPE}, ?, ?, '2026-01', NULL)`,
  ).run(ENROLLMENT, centerCode, STUDENT, GROUP);
  db.prepare(
    `INSERT INTO weekly_recurring_sessions (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, room_id, teacher_id, group_id, day_of_week, start_time, end_time, active, valid_from, valid_to, conflict_accepted)
     VALUES (?, ?, ${ENVELOPE}, ?, ?, ?, 1, '14:00', '16:00', 1, NULL, NULL, 0)`,
  ).run(WRS, centerCode, ROOM, TEACHER, GROUP);
  db.prepare(
    `INSERT INTO sessions (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, recurring_session_id, generation_batch_id, room_id, teacher_id, group_id, date, start_time, end_time)
     VALUES (?, ?, ${ENVELOPE}, ?, NULL, ?, ?, ?, '2026-01-05', '14:00', '16:00')`,
  ).run(SESSION, centerCode, WRS, ROOM, TEACHER, GROUP);
  db.prepare(
    `INSERT INTO invoices (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, student_id, month, status, issued_at, cancelled_at)
     VALUES (?, ?, ${ENVELOPE}, ?, '2026-01', 'issued', '2026-01-01T10:00:00.000Z', NULL)`,
  ).run(INVOICE, centerCode, STUDENT);
  db.prepare(
    `INSERT INTO invoice_lines (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, invoice_id, formula_id, label_fr, label_ar, kind, amount_mad)
     VALUES (?, ?, ${ENVELOPE}, ?, ?, 'Math seul', 'الرياضيات فقط', 'regular', 20000)`,
  ).run(INVOICE_LINE, centerCode, INVOICE, FORMULA);
  db.prepare(
    `INSERT INTO payments (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, invoice_id, kind, amount_mad, method, paid_on, reverses_payment_id, note)
     VALUES (?, ?, ${ENVELOPE}, ?, 'payment', 20000, 'cash', '2026-01-05', NULL, NULL)`,
  ).run(PAYMENT, centerCode, INVOICE);
  db.prepare(
    `INSERT INTO center_hours (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, day_of_week, windows)
     VALUES (?, ?, ${ENVELOPE}, 1, ?)`,
  ).run('chr_00000000000000000000000001', centerCode, JSON.stringify([{ open: '09:00', close: '18:00' }]));
  db.prepare(
    `INSERT INTO holidays (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name_fr, name_ar, kind, start_date, end_date)
     VALUES (?, ?, ${ENVELOPE}, 'Aïd al-Fitr', 'عيد الفطر', 'lunar', '2026-03-20', '2026-03-22')`,
  ).run(HOLIDAY, centerCode);
  db.prepare(
    `INSERT INTO center_hours_overrides (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, start_date, end_date, hours_by_weekday)
     VALUES (?, ?, ${ENVELOPE}, '2026-02-18', '2026-03-19', ?)`,
  ).run(
    CHO,
    centerCode,
    JSON.stringify({ 0: [], 1: [{ open: '09:00', close: '15:00' }], 2: [], 3: [], 4: [], 5: [], 6: [] }),
  );
  db.prepare(
    `INSERT INTO teacher_availability (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, weekly_windows)
     VALUES (?, ?, ${ENVELOPE}, ?, ?)`,
  ).run(
    TAV,
    centerCode,
    TEACHER,
    JSON.stringify({ 0: [], 1: [{ open: '08:00', close: '12:00' }], 2: [], 3: [], 4: [], 5: [], 6: [] }),
  );
  db.prepare(
    `INSERT INTO teacher_availability_exceptions (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, start_date, end_date, label)
     VALUES (?, ?, ${ENVELOPE}, ?, '2026-05-01', '2026-05-15', 'Congé')`,
  ).run(TAE, centerCode, TEACHER);
}

function makeStore(database: DB, centerCode: string): SqliteBackupStore {
  return new SqliteBackupStore(database, centerCode, new SqliteChangeLogWriter(database, TEST_CLOCK, DEVICE));
}

describe('export a full center, then re-import the SAME file into the SAME center', () => {
  it('classifies every row as updated/duplicate — never invalid', async () => {
    seedFullCenter(CENTER);
    const store = makeStore(db, CENTER);
    const excel = new ExcelBackupAdapter();
    const plan = new PlanPolicy(PLANS.pro);

    const workbookPath = join(dir, 'full-center-backup.xlsx');
    const exportResult = await new ExportBackup(store, excel, plan).execute({ filePath: workbookPath });
    // Every sheet has exactly the one row seeded above.
    for (const [sheetName, count] of Object.entries(exportResult.counts)) {
      expect(count, sheetName).toBe(1);
    }

    const preview = await new PreviewImportBackup(store, excel, plan).execute({
      filePath: workbookPath,
      centerCode: CENTER as never,
    });

    const invalidRows = preview.rows.filter((row) => row.status === 'invalid');
    expect(invalidRows, JSON.stringify(invalidRows, null, 2)).toEqual([]);
    expect(preview.unknownSheets).toEqual([]);
    expect(preview.counts.invalid).toBe(0);
    // payments + formulas are `restoreConflict: 'skip'` sheets — an existing id
    // replays as `duplicate`, never `updated`; every other sheet upserts.
    const bySheet = new Map(preview.rows.map((row) => [row.sheetName, row.status]));
    expect(bySheet.get('payments')).toBe('duplicate');
    expect(bySheet.get('formulas')).toBe('duplicate');
    expect(bySheet.get('rooms')).toBe('updated');
    expect(bySheet.get('students')).toBe('updated');
    expect(bySheet.get('center-hours')).toBe('updated');
    expect(bySheet.get('center-hours-overrides')).toBe('updated');
    expect(bySheet.get('teacher-availability')).toBe('updated');
  });
});
