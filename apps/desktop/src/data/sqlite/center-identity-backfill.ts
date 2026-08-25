import type { Database as DB } from 'better-sqlite3';
import {
  toEntityId,
  type Center,
  type CenterCode,
  type CenterId,
  type ChangeLogWriter,
  type DeviceId,
  type Membership,
  type MembershipId,
  type Organization,
  type OrganizationId,
  type PlanId,
  type Role,
  type UserId,
} from '@centresoutien/domain';

/**
 * Backfills the change log for a center whose identity predates SOU-318
 * sync-wiring, so it can still be joined from a second device.
 *
 * `center` / `organization` / `membership` only began writing to `change_log`
 * in SOU-318. A center provisioned by an EARLIER build therefore has those rows
 * in its tables but no `change_log` entries for them — so on upgrade its host
 * pushes an empty identity and a joining device cold-bootstraps nothing
 * (`SqliteCenterJoinProvisioning` throws "the hub returned no center"). That is
 * exactly the feature's headline scenario (a center set up long before this
 * build), so without this it would fail for every real, already-running center.
 *
 * Runs once at center open, after migrations: for each identity row THIS device
 * authored (`device_origin` matches) that has no `change_log` entry yet, it
 * records a create so the next push publishes it. Two guards keep it safe to run
 * on every open:
 *
 *  - **`device_origin` match** — a JOINED replica's identity rows arrive through
 *    sync-apply, which writes the real tables but NEVER `change_log` (only
 *    {@link SqliteChangeLogWriter} does). Re-logging them there would echo the
 *    pulled center straight back to the hub as if this device had authored it.
 *    Only the device that first created a row may put it into its own outbox.
 *  - **no existing entry** — a row already logged (a fresh SOU-318 center, or a
 *    previous backfill run) is skipped, so the append happens at most once.
 */
export function backfillCenterIdentityChangeLog(
  db: DB,
  changeLog: ChangeLogWriter,
  deviceOrigin: DeviceId,
): void {
  db.transaction(() => {
    backfillCenter(db, changeLog, deviceOrigin);
    backfillOrganizations(db, changeLog, deviceOrigin);
    backfillMemberships(db, changeLog, deviceOrigin);
  })();
}

function backfillCenter(db: DB, changeLog: ChangeLogWriter, deviceOrigin: DeviceId): void {
  const row = db.prepare('SELECT * FROM center LIMIT 1').get() as CenterRow | undefined;
  if (row === undefined || row.device_origin !== deviceOrigin) return;
  if (hasChangeLogEntry(db, 'center', row.id)) return;
  const center = centerFromRow(row);
  changeLog.record({
    entityType: 'center',
    entityId: toEntityId(center.id),
    centerCode: center.centerCode,
    intent: 'upsert',
    entity: center,
  });
}

function backfillOrganizations(db: DB, changeLog: ChangeLogWriter, deviceOrigin: DeviceId): void {
  const rows = db.prepare('SELECT * FROM organization').all() as OrganizationRow[];
  for (const row of rows) {
    if (row.device_origin !== deviceOrigin) continue;
    if (hasChangeLogEntry(db, 'organization', row.id)) continue;
    const organization = organizationFromRow(row);
    changeLog.record({
      entityType: 'organization',
      entityId: toEntityId(organization.id),
      centerCode: organization.centerCode,
      intent: 'upsert',
      entity: organization,
    });
  }
}

function backfillMemberships(db: DB, changeLog: ChangeLogWriter, deviceOrigin: DeviceId): void {
  const rows = db.prepare('SELECT * FROM membership').all() as MembershipRow[];
  for (const row of rows) {
    if (row.device_origin !== deviceOrigin) continue;
    if (hasChangeLogEntry(db, 'membership', row.id)) continue;
    const membership = membershipFromRow(row);
    changeLog.record({
      entityType: 'membership',
      entityId: toEntityId(membership.id),
      centerCode: membership.centerCode,
      intent: 'upsert',
      entity: membership,
    });
  }
}

function hasChangeLogEntry(db: DB, entityType: string, entityId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM change_log WHERE entity_type = ? AND entity_id = ? LIMIT 1')
    .get(entityType, entityId);
  return row !== undefined;
}

type EnvelopeRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
};

type CenterRow = EnvelopeRow & {
  name: string;
  address: string;
  phone: string;
  email: string;
  logo_path: string | null;
  plan: string;
};

type OrganizationRow = EnvelopeRow & {
  name: string;
  billing_contact: string;
};

type MembershipRow = EnvelopeRow & {
  user_id: string;
  centre_id: string;
  role: string;
};

function centerFromRow(row: CenterRow): Center {
  return {
    ...envelopeFromRow(row),
    id: row.id as CenterId,
    name: row.name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    logoPath: row.logo_path,
    plan: row.plan as PlanId,
  };
}

function organizationFromRow(row: OrganizationRow): Organization {
  return {
    ...envelopeFromRow(row),
    id: row.id as OrganizationId,
    name: row.name,
    billingContact: row.billing_contact,
  };
}

function membershipFromRow(row: MembershipRow): Membership {
  return {
    ...envelopeFromRow(row),
    id: row.id as MembershipId,
    userId: row.user_id as UserId,
    centreId: row.centre_id as CenterCode,
    role: row.role as Role,
  };
}

function envelopeFromRow(row: EnvelopeRow) {
  return {
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
  };
}
