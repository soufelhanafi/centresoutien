import type {
  BackupRow,
  CenterCode,
  DeviceId,
  Subject,
  SubjectId,
  UserId,
} from "@centresoutien/domain";
import { SHEET_SQL } from "../repositories/backup-store-sheets";
import {
  toSqlValue,
  type SheetSqlConfig,
} from "../repositories/backup-store-config";

/** Maps a deserialized change_log payload (domain shape, SOU-170) onto the
 *  CURRENT physical row of the entity's table. Replay (and, later, sync-apply)
 *  resolve one per entityType so an old payload always lands on today's
 *  columns, no matter which migration renamed/dropped/re-typed them. */
export type ChangeLogEntityToRowMapper = (
  entity: unknown,
) => Record<string, unknown>;

const registered = new Map<string, ChangeLogEntityToRowMapper>();

/** Registers an explicit domain-shape → physical-row mapper for an entityType.
 *  Any repository that logs its writes registers here so its versioned domain
 *  payload can be replayed/applied. An explicit mapper wins over the generic
 *  sheet fallback (a logged `subjects` payload is the nested domain Subject,
 *  which the flat workbook config cannot map). */
export function registerChangeLogEntityToRowMapper(
  entityType: string,
  mapper: ChangeLogEntityToRowMapper,
): void {
  registered.set(entityType, mapper);
}

/**
 * Resolves the mapper for an entityType: an explicitly registered domain mapper
 * wins; otherwise the {@link SHEET_SQL} logical→physical column registry covers
 * every backup sheet (whose logged payload is its flat logical row shape).
 * Returns undefined for an entityType neither knows — replay must never guess a
 * table name or column set.
 */
export function getChangeLogEntityToRowMapper(
  entityType: string,
): ChangeLogEntityToRowMapper | undefined {
  const explicit = registered.get(entityType);
  if (explicit) return explicit;
  const config = (SHEET_SQL as Readonly<Record<string, SheetSqlConfig>>)[
    entityType
  ];
  if (config) return (entity: unknown) => sheetRowFromEntity(config, entity);
  return undefined;
}

/**
 * Converts the flat workbook `subjects` row (SHEET_SQL logical shape) into the
 * canonical domain {@link Subject}, so a restore logs the same payload shape
 * the subject repository does. One shape per entityType is what makes the log
 * replayable/applicable on any device (SOU-170).
 */
export function subjectBackupRowToEntity(row: BackupRow): Subject {
  return {
    id: row["id"] as SubjectId,
    centerCode: row["centerCode"] as CenterCode,
    deviceOrigin: row["deviceOrigin"] as DeviceId,
    createdAt: new Date(row["createdAt"] as string),
    updatedAt: new Date(row["updatedAt"] as string),
    updatedBy: row["updatedBy"] as UserId,
    deletedAt:
      row["deletedAt"] == null ? null : new Date(row["deletedAt"] as string),
    version: row["version"] as number,
    name: { fr: row["name_fr"] as string, ar: row["name_ar"] as string },
    code: row["code"] as string | null,
    active: row["active"] === true || row["active"] === 1,
  };
}

function sheetRowFromEntity(
  config: SheetSqlConfig,
  entity: unknown,
): Record<string, unknown> {
  const source = (entity ?? {}) as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const [domainColumn, sqlColumn] of config.columns) {
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
    deleted_at:
      subject.deletedAt === null ? null : toIsoString(subject.deletedAt),
    version: subject.version,
    name_fr: subject.name.fr,
    name_ar: subject.name.ar,
    code: subject.code,
    active: subject.active ? 1 : 0,
  };
}

function toIsoString(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

// Default registration: `subjects` is the first repo-written entityType in the
// log (SOU-79 representative slice); its payload is the nested domain Subject.
registerChangeLogEntityToRowMapper("subjects", subjectEntityToRow);
