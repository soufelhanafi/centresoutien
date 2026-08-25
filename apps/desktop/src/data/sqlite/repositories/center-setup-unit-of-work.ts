import type { Database as DB } from "better-sqlite3";
import type {
  Center,
  CenterHours,
  CenterSetupUnit,
  CenterSetupUnitOfWork,
  ChangeLogWriter,
  Membership,
  Niveau,
  Organization,
} from "@centresoutien/domain";
import { toEntityId } from "@centresoutien/domain";

const SAVE_CENTER_SQL = `
  INSERT INTO center
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, name, address, phone, email, logo_path, plan, singleton)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @name, @address, @phone, @email, @logo_path, @plan, 1)
`;

const SAVE_HOURS_SQL = `
  INSERT INTO center_hours
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, day_of_week, windows)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @day_of_week, @windows)
`;

const SAVE_TRIAL_SQL = `
  INSERT INTO center_trial (singleton, started_at, last_seen_at)
  VALUES (1, ?, ?)
  ON CONFLICT(singleton) DO NOTHING
`;

const SAVE_NIVEAU_SQL = `
  INSERT INTO niveaux
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, name_fr, name_ar, code, category, active)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @name_fr, @name_ar, @code, @category, @active)
`;

const SAVE_ORGANIZATION_SQL = `
  INSERT INTO organization
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, name, billing_contact)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @name, @billing_contact)
`;

const SAVE_MEMBERSHIP_SQL = `
  INSERT INTO membership
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, user_id, centre_id, role)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @user_id, @centre_id, @role)
`;

/** Test-only hook for asserting that partial setup writes roll back. */
export type SqliteCenterSetupUnitOfWorkOptions = {
  readonly afterCenterInsert?: () => void;
};

/**
 * SQLite transaction for first-center setup. It deliberately writes directly
 * instead of composing repository calls: better-sqlite3 transactions are
 * synchronous, while repository ports are asynchronous by contract.
 *
 * Center, organization, and membership are synced entity types (SOU-318), so each
 * seed write is also appended to the change log in the SAME transaction. That is
 * what lets the hub carry a freshly provisioned center's identity + ownership, so
 * a second device can cold-bootstrap the whole center from the feed. `center` is
 * always logged; the ownership rows are logged only when present (they are `null`
 * at first-run, before any user exists to own the center). Hours and niveaux are
 * not logged here — they carry no registered sync mapper yet (their own repos log
 * later edits), so logging their seed rows would only shadow-store them.
 */
export class SqliteCenterSetupUnitOfWork implements CenterSetupUnitOfWork {
  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
    private readonly options: SqliteCenterSetupUnitOfWorkOptions = {},
  ) {}

  async commit(unit: CenterSetupUnit): Promise<void> {
    this.db.transaction(() => {
      this.insertCenter(unit.center);
      this.options.afterCenterInsert?.();
      this.insertHours(unit.defaultHours);
      this.insertNiveaux(unit.defaultNiveaux);
      this.insertOwnership(unit);
      this.insertTrial(unit);
    })();
  }

  private insertCenter(center: Center): void {
    this.db.prepare(SAVE_CENTER_SQL).run(centerRow(center));
    this.changeLog.record({
      entityType: "center",
      entityId: toEntityId(center.id),
      centerCode: center.centerCode,
      intent: "upsert",
      entity: center,
    });
  }

  private insertHours(hours: readonly CenterHours[]): void {
    const saveHours = this.db.prepare(SAVE_HOURS_SQL);
    for (const day of hours) saveHours.run(centerHoursRow(day));
  }

  private insertNiveaux(niveaux: readonly Niveau[]): void {
    const saveNiveau = this.db.prepare(SAVE_NIVEAU_SQL);
    for (const niveau of niveaux) saveNiveau.run(niveauRow(niveau));
  }

  /**
   * The ownership rows (SOU-310): the owning Organization and the director's owner
   * Membership. Both are `null` at first-run (no user exists to own the center
   * yet), so this is a no-op there and only writes for the add-a-center flow.
   * Each written row is logged (SOU-318) so ownership syncs like the center row.
   */
  private insertOwnership(unit: CenterSetupUnit): void {
    if (unit.organization !== null) {
      this.db.prepare(SAVE_ORGANIZATION_SQL).run(organizationRow(unit.organization));
      this.changeLog.record({
        entityType: "organization",
        entityId: toEntityId(unit.organization.id),
        centerCode: unit.organization.centerCode,
        intent: "upsert",
        entity: unit.organization,
      });
    }
    if (unit.membership !== null) {
      this.db.prepare(SAVE_MEMBERSHIP_SQL).run(membershipRow(unit.membership));
      this.changeLog.record({
        entityType: "membership",
        entityId: toEntityId(unit.membership.id),
        centerCode: unit.membership.centerCode,
        intent: "upsert",
        entity: unit.membership,
      });
    }
  }

  private insertTrial(unit: CenterSetupUnit): void {
    if (unit.trial === null) return;
    this.db
      .prepare(SAVE_TRIAL_SQL)
      .run(
        unit.trial.startedAt.toISOString(),
        unit.trial.lastSeenAt.toISOString(),
      );
  }
}

function centerRow(center: Center) {
  return {
    id: center.id,
    center_code: center.centerCode,
    device_origin: center.deviceOrigin,
    created_at: center.createdAt.toISOString(),
    updated_at: center.updatedAt.toISOString(),
    updated_by: center.updatedBy,
    deleted_at: center.deletedAt ? center.deletedAt.toISOString() : null,
    version: center.version,
    name: center.name,
    address: center.address,
    phone: center.phone,
    email: center.email,
    logo_path: center.logoPath,
    plan: center.plan,
  };
}

function centerHoursRow(hours: CenterHours) {
  return {
    id: hours.id,
    center_code: hours.centerCode,
    device_origin: hours.deviceOrigin,
    created_at: hours.createdAt.toISOString(),
    updated_at: hours.updatedAt.toISOString(),
    updated_by: hours.updatedBy,
    deleted_at: hours.deletedAt ? hours.deletedAt.toISOString() : null,
    version: hours.version,
    day_of_week: hours.dayOfWeek,
    windows: JSON.stringify(hours.windows),
  };
}

function organizationRow(organization: Organization) {
  return {
    id: organization.id,
    center_code: organization.centerCode,
    device_origin: organization.deviceOrigin,
    created_at: organization.createdAt.toISOString(),
    updated_at: organization.updatedAt.toISOString(),
    updated_by: organization.updatedBy,
    deleted_at: organization.deletedAt ? organization.deletedAt.toISOString() : null,
    version: organization.version,
    name: organization.name,
    billing_contact: organization.billingContact,
  };
}

function membershipRow(membership: Membership) {
  return {
    id: membership.id,
    center_code: membership.centerCode,
    device_origin: membership.deviceOrigin,
    created_at: membership.createdAt.toISOString(),
    updated_at: membership.updatedAt.toISOString(),
    updated_by: membership.updatedBy,
    deleted_at: membership.deletedAt ? membership.deletedAt.toISOString() : null,
    version: membership.version,
    user_id: membership.userId,
    centre_id: membership.centreId,
    role: membership.role,
  };
}

function niveauRow(niveau: Niveau) {
  return {
    id: niveau.id,
    center_code: niveau.centerCode,
    device_origin: niveau.deviceOrigin,
    created_at: niveau.createdAt.toISOString(),
    updated_at: niveau.updatedAt.toISOString(),
    updated_by: niveau.updatedBy,
    deleted_at: niveau.deletedAt ? niveau.deletedAt.toISOString() : null,
    version: niveau.version,
    name_fr: niveau.name.fr,
    name_ar: niveau.name.ar,
    code: niveau.code,
    category: niveau.category,
    active: niveau.active ? 1 : 0,
  };
}
