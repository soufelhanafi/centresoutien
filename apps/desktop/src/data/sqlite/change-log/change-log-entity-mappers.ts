import type {
  BackupRow,
  CenterCode,
  CenterHoursOverride,
  DeviceId,
  Niveau,
  Payment,
  Session,
  Subject,
  SubjectId,
  UserId,
  WeeklyRecurringSession,
} from '@centresoutien/domain';
import { SHEET_BY_TABLE } from '../repositories/backup-store-sheets';
import { toSqlValue, type SheetSqlConfig } from '../repositories/backup-store-config';

/** Maps a deserialized change_log payload (domain shape, SOU-170) onto the
 *  CURRENT physical row of the entity's table. Replay (and, later, sync-apply)
 *  resolve one per entityType so an old payload always lands on today's
 *  columns, no matter which migration renamed/dropped/re-typed them. */
export type ChangeLogEntityToRowMapper = (entity: unknown) => Record<string, unknown>;

export type ProjectionMode = 'mutable' | 'append-only';

export type ChangeLogEntityProjection = {
  readonly mapper: ChangeLogEntityToRowMapper;
  readonly mode: ProjectionMode;
};

const registered = new Map<string, ChangeLogEntityProjection>();

/** Registers an explicit domain-shape → physical-row mapper for an entityType.
 *  Any repository that logs its writes registers here so its versioned domain
 *  payload can be replayed/applied. An explicit mapper wins over the generic
 *  sheet fallback (a logged `subjects` payload is the nested domain Subject,
 *  which the flat workbook config cannot map). */
export function registerChangeLogEntityToRowMapper(
  entityType: string,
  mapper: ChangeLogEntityToRowMapper,
  mode: ProjectionMode = 'mutable',
): void {
  registered.set(entityType, { mapper, mode });
}

/**
 * Resolves the mapper for an entityType: an explicitly registered domain mapper
 * wins; otherwise the {@link SHEET_BY_TABLE} logical→physical column registry
 * covers every backup sheet — resolved by PHYSICAL TABLE NAME, because that is
 * what a writer logs as `entityType` (SOU-170) and sheet names diverge from
 * table names for multi-word sheets (`student-subscriptions` → `student_subscriptions`).
 * Returns undefined for an entityType neither knows — replay must never guess a
 * table name or column set.
 */
export function getChangeLogEntityToRowMapper(
  entityType: string,
): ChangeLogEntityToRowMapper | undefined {
  const explicit = registered.get(entityType);
  if (explicit) return explicit.mapper;
  const config = SHEET_BY_TABLE.get(entityType);
  if (config) return (entity: unknown) => sheetLogicalRowToRow(config, entity);
  return undefined;
}

/**
 * The EXPLICITLY registered domain-shape mapper for an entityType, or undefined.
 * Sync-apply projection (SOU-180) uses this rather than
 * {@link getChangeLogEntityToRowMapper}: a synced payload is always the nested
 * domain entity (change_log/hub shape), so the flat backup-sheet fallback would
 * mis-map it. An entityType without a registered domain mapper simply is not
 * projected into its real table yet — it lights up when its repo starts logging.
 */
export function getRegisteredChangeLogEntityToRowMapper(
  entityType: string,
): ChangeLogEntityToRowMapper | undefined {
  return registered.get(entityType)?.mapper;
}

export function getRegisteredChangeLogEntityProjection(
  entityType: string,
): ChangeLogEntityProjection | undefined {
  return registered.get(entityType);
}

/**
 * Converts the flat workbook `subjects` row (SHEET_SQL logical shape) into the
 * canonical domain {@link Subject}, so a restore logs the same payload shape
 * the subject repository does. One shape per entityType is what makes the log
 * replayable/applicable on any device (SOU-170).
 */
export function subjectBackupRowToEntity(row: BackupRow): Subject {
  return {
    id: row['id'] as SubjectId,
    centerCode: row['centerCode'] as CenterCode,
    deviceOrigin: row['deviceOrigin'] as DeviceId,
    createdAt: new Date(row['createdAt'] as string),
    updatedAt: new Date(row['updatedAt'] as string),
    updatedBy: row['updatedBy'] as UserId,
    deletedAt: row['deletedAt'] == null ? null : new Date(row['deletedAt'] as string),
    version: row['version'] as number,
    name: { fr: row['name_fr'] as string, ar: row['name_ar'] as string },
    code: row['code'] as string | null,
    active: row['active'] === true || row['active'] === 1,
  };
}

/**
 * Fallback mapper for backup-sheet entityTypes whose payload is the FLAT logical
 * workbook row (what {@link SqliteBackupStore} logs), not a domain entity with
 * nested/typed fields. Each column pair from the sheet config converts one
 * logical value to its physical SQLite value. `readOnlyColumns` are skipped so
 * replay can never write DB-owned columns the backup-store itself refuses to
 * write (e.g. `formulas.is_immutable` is granted solely by the invoice-lines
 * trigger — a replay must not fabricate it). If a repository ever logs a real
 * domain entity for one of these types, it must register an explicit mapper
 * (and upcast any flat payloads) instead of relying on this — the flat shape
 * cannot represent a nested bilingual `name`, for example.
 */
function sheetLogicalRowToRow(config: SheetSqlConfig, entity: unknown): Record<string, unknown> {
  const source = (entity ?? {}) as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const [domainColumn, sqlColumn] of config.columns) {
    if (config.readOnlyColumns?.includes(domainColumn)) continue;
    row[sqlColumn] = toSqlValue(domainColumn, source[domainColumn]);
  }
  return row;
}

function subjectEntityToRow(entity: unknown): Record<string, unknown> {
  const subject = entity as Subject;
  return {
    id: subject.id,
    center_code: subject.centerCode,
    device_origin: subject.deviceOrigin,
    created_at: toIsoString(subject.createdAt),
    updated_at: toIsoString(subject.updatedAt),
    updated_by: subject.updatedBy,
    deleted_at: subject.deletedAt === null ? null : toIsoString(subject.deletedAt),
    version: subject.version,
    name_fr: subject.name.fr,
    name_ar: subject.name.ar,
    code: subject.code,
    active: subject.active ? 1 : 0,
  };
}

function niveauEntityToRow(entity: unknown): Record<string, unknown> {
  const niveau = entity as Niveau;
  return {
    id: niveau.id,
    center_code: niveau.centerCode,
    device_origin: niveau.deviceOrigin,
    created_at: toIsoString(niveau.createdAt),
    updated_at: toIsoString(niveau.updatedAt),
    updated_by: niveau.updatedBy,
    deleted_at: niveau.deletedAt === null ? null : toIsoString(niveau.deletedAt),
    version: niveau.version,
    name_fr: niveau.name.fr,
    name_ar: niveau.name.ar,
    code: niveau.code,
    category: niveau.category,
    active: niveau.active ? 1 : 0,
  };
}

function toIsoString(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

function weeklyRecurringSessionEntityToRow(entity: unknown): Record<string, unknown> {
  const session = entity as WeeklyRecurringSession;
  return {
    id: session.id,
    center_code: session.centerCode,
    device_origin: session.deviceOrigin,
    created_at: toIsoString(session.createdAt),
    updated_at: toIsoString(session.updatedAt),
    updated_by: session.updatedBy,
    deleted_at: session.deletedAt === null ? null : toIsoString(session.deletedAt),
    version: session.version,
    room_id: session.roomId,
    teacher_id: session.teacherId,
    group_id: session.groupId,
    day_of_week: session.dayOfWeek,
    start_time: session.start,
    end_time: session.end,
    active: session.active ? 1 : 0,
    valid_from: session.validFrom,
    valid_to: session.validTo,
    conflict_accepted: session.conflictAccepted ? 1 : 0,
  };
}

function sessionEntityToRow(entity: unknown): Record<string, unknown> {
  const session = entity as Session;
  return {
    id: session.id,
    center_code: session.centerCode,
    device_origin: session.deviceOrigin,
    created_at: toIsoString(session.createdAt),
    updated_at: toIsoString(session.updatedAt),
    updated_by: session.updatedBy,
    deleted_at: session.deletedAt === null ? null : toIsoString(session.deletedAt),
    version: session.version,
    recurring_session_id: session.recurringSessionId,
    generation_batch_id: session.generationBatchId,
    room_id: session.roomId,
    teacher_id: session.teacherId,
    group_id: session.groupId,
    date: session.date,
    start_time: session.start,
    end_time: session.end,
  };
}

function centerHoursOverrideEntityToRow(entity: unknown): Record<string, unknown> {
  const override = entity as CenterHoursOverride;
  return {
    id: override.id,
    center_code: override.centerCode,
    device_origin: override.deviceOrigin,
    created_at: toIsoString(override.createdAt),
    updated_at: toIsoString(override.updatedAt),
    updated_by: override.updatedBy,
    deleted_at: override.deletedAt === null ? null : toIsoString(override.deletedAt),
    version: override.version,
    start_date: override.dateRange.start,
    end_date: override.dateRange.end,
    hours_by_weekday: JSON.stringify(override.hoursByWeekday),
  };
}

function paymentEntityToRow(entity: unknown): Record<string, unknown> {
  const payment = entity as Payment;
  return {
    id: payment.id,
    center_code: payment.centerCode,
    device_origin: payment.deviceOrigin,
    created_at: toIsoString(payment.createdAt),
    updated_at: toIsoString(payment.updatedAt),
    updated_by: payment.updatedBy,
    deleted_at: payment.deletedAt === null ? null : toIsoString(payment.deletedAt),
    version: payment.version,
    invoice_id: payment.invoiceId,
    kind: payment.kind,
    amount_mad: payment.amountMad,
    method: payment.method,
    paid_on: payment.paidOn,
    reverses_payment_id: payment.reversesPaymentId,
    note: payment.note,
  };
}

// Default registration: `subjects` is the first repo-written entityType in the
// log (SOU-79 representative slice); its payload is the nested domain Subject.
registerChangeLogEntityToRowMapper('subjects', subjectEntityToRow);
// `niveaux` (SOU-260): the niveau catalog repository logs nested domain Niveaux
// (bilingual name, category), so sync-apply projects them onto the real columns.
registerChangeLogEntityToRowMapper('niveaux', niveauEntityToRow);
// `weekly_recurring_sessions` + `sessions` (SOU-132): the planner grid derives a
// session's subject/level/kind from the group via the join, so sync-apply must
// project `groupId` onto `group_id` or laptop B renders the neutral fallback.
registerChangeLogEntityToRowMapper('weekly_recurring_sessions', weeklyRecurringSessionEntityToRow);
registerChangeLogEntityToRowMapper('sessions', sessionEntityToRow);
// `center_hours_overrides` (SOU-199): a synced Ramadan-style hours override. Its
// nested `dateRange.{start,end}` flatten to `start_date`/`end_date` and
// `hoursByWeekday` serializes to the `hours_by_weekday` JSON text column, exactly
// as the repository's own SAVE_SQL does — so a pulled override lands on laptop B's
// real table instead of the neutral fallback.
registerChangeLogEntityToRowMapper('center_hours_overrides', centerHoursOverrideEntityToRow);
registerChangeLogEntityToRowMapper('payments', paymentEntityToRow, 'append-only');
