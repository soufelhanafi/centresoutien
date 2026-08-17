import type { Database as DB } from "better-sqlite3";
import type {
  Center,
  CenterHours,
  CenterSetupUnit,
  CenterSetupUnitOfWork,
  Niveau,
} from "@centresoutien/domain";

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

/** Test-only hook for asserting that partial setup writes roll back. */
export type SqliteCenterSetupUnitOfWorkOptions = {
  readonly afterCenterInsert?: () => void;
};

/**
 * SQLite transaction for first-center setup. It deliberately writes directly
 * instead of composing repository calls: better-sqlite3 transactions are
 * synchronous, while repository ports are asynchronous by contract.
 */
export class SqliteCenterSetupUnitOfWork implements CenterSetupUnitOfWork {
  constructor(
    private readonly db: DB,
    private readonly options: SqliteCenterSetupUnitOfWorkOptions = {},
  ) {}

  async commit(unit: CenterSetupUnit): Promise<void> {
    this.db.transaction(() => {
      this.insertCenter(unit.center);
      this.options.afterCenterInsert?.();
      this.insertHours(unit.defaultHours);
      this.insertNiveaux(unit.defaultNiveaux);
      this.insertTrial(unit);
    })();
  }

  private insertCenter(center: Center): void {
    this.db.prepare(SAVE_CENTER_SQL).run(centerRow(center));
  }

  private insertHours(hours: readonly CenterHours[]): void {
    const saveHours = this.db.prepare(SAVE_HOURS_SQL);
    for (const day of hours) saveHours.run(centerHoursRow(day));
  }

  private insertNiveaux(niveaux: readonly Niveau[]): void {
    const saveNiveau = this.db.prepare(SAVE_NIVEAU_SQL);
    for (const niveau of niveaux) saveNiveau.run(niveauRow(niveau));
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
