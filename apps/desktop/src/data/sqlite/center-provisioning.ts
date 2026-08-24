import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import {
  CenterProvisioningError,
  DeviceSessionService,
  newCenter,
  newCenterOwnership,
  newCenterTrial,
  newDefaultCenterHours,
  newDefaultNiveaux,
  newEnvelope,
  type CenterCode,
  type CenterProfileInput,
  type CenterProvisioningPort,
  type Clock,
  type DeviceId,
  type IdGenerator,
  type PlanId,
  type ProvisionCenterInput,
  type ProvisionCenterResult,
  type User,
  type UserId,
} from '@centresoutien/domain';
import { centreDbFileName, openDatabase } from './db';
import { applyMigrations, type Migration } from './migration-runner';
import { readOrCreateDeviceOrigin } from './device-origin';
import { SqliteCenterSetupUnitOfWork } from './repositories/center-setup-unit-of-work';
import { SqliteUserRepository } from './repositories/user-repository';
import { SqliteDeviceSessionStore } from './repositories/device-session-store';
import { SqliteChangeLogWriter } from './change-log/sqlite-change-log-writer';
import type { CenterKeyProvider } from './center-directory';

export type CenterProvisioningDeps = {
  /** userData dir holding the `centre-*.db` files. */
  dir: string;
  /** Derives the SQLCipher key for a `centreId` — a NEW center's key is derived
   *  for free from the existing keychain master (SOU-179), no new material. */
  keyFor: CenterKeyProvider;
  /** The current schema's migrations, resolved by the composition root (Vite
   *  glob) or, in tests, from disk — kept out of this adapter so it stays
   *  bundler-agnostic and unit-testable. */
  migrations: readonly Migration[];
  clock: Clock;
  ids: IdGenerator;
  /** Whether a valid license exists — a trial is only seeded when it does not. */
  hasActiveLicense: () => boolean;
  /** Plan seeded onto the new center row (display-only mirror; see Center). */
  seedPlan: PlanId;
  /** The signed-in director — the CURRENT center's owner user, resolved from the
   *  open center itself (never renderer input). They become the new center's owner
   *  so they can operate it immediately without a second sign-in. */
  currentOwner: () => Promise<User | null>;
};

/**
 * Creates a brand-new, fully isolated center DB on this machine (SOU-310). It
 * allocates a fresh `centreId` + `centerCode`, opens and migrates a new encrypted
 * `centre-{centreId}.db`, and seeds the profile, default hours, niveau catalog,
 * trial, ownership rows, AND the director's owner account + a remembered device
 * session — so that when {@link CreateCenter} switches into the new center the
 * director lands straight in the shell, not the first-run wizard or login screen.
 *
 * It never touches the currently-open center (it opens its own transient handle
 * and closes it), and on any failure it removes the partial DB file so a failed
 * provision is always "nothing created". Switching into the new center is the
 * caller's job (`CreateCenter` → `CenterSwitchPort`).
 */
export class SqliteCenterProvisioning implements CenterProvisioningPort {
  constructor(private readonly deps: CenterProvisioningDeps) {}

  async provision({ profile }: ProvisionCenterInput): Promise<ProvisionCenterResult> {
    // Resolve the director before creating anything: a new center must have an
    // owner, and the only legitimate owner is the signed-in director of the center
    // this flow ran from. No owner ⇒ nothing is created.
    const director = await this.deps.currentOwner();
    if (director === null) {
      throw new CenterProvisioningError('no signed-in director to own the new center');
    }

    const centreId = this.allocateCentreId();
    const centerCode = deriveCenterCode(centreId);
    const file = join(this.deps.dir, centreDbFileName(centreId));
    if (existsSync(file)) {
      throw new CenterProvisioningError(`a center database already exists at ${file}`);
    }

    let db: DB | null = null;
    try {
      db = openDatabase({ centreId, key: this.deps.keyFor(centreId), dir: this.deps.dir });
      applyMigrations(db, [...this.deps.migrations]);
      await this.seed(db, profile, centerCode, director);
      db.close();
      db = null;
      return { centreId, centerCode };
    } catch (error) {
      db?.close();
      this.removePartial(file);
      throw error instanceof CenterProvisioningError
        ? error
        : new CenterProvisioningError(reasonFrom(error));
    }
  }

  private async seed(
    db: DB,
    profile: CenterProfileInput,
    centerCode: CenterCode,
    director: User,
  ): Promise<void> {
    const deviceOrigin = readOrCreateDeviceOrigin(db, this.deps.ids);
    const context = { centerCode, deviceOrigin, updatedBy: director.id };

    const center = newCenter(
      { ...context, profile, logoPath: null, seedPlan: this.deps.seedPlan },
      this.deps.clock,
      this.deps.ids,
    );
    const { organization, membership } = newCenterOwnership(
      {
        ...context,
        directorUserId: director.id,
        organizationName: profile.name,
        billingContact: billingContactFrom(profile),
      },
      this.deps.clock,
      this.deps.ids,
    );

    await new SqliteCenterSetupUnitOfWork(db).commit({
      center,
      defaultHours: newDefaultCenterHours(context, this.deps.clock, this.deps.ids),
      defaultNiveaux: newDefaultNiveaux(context, this.deps.clock, this.deps.ids),
      trial: this.deps.hasActiveLicense() ? null : newCenterTrial(this.deps.clock.now()),
      organization,
      membership,
    });

    await this.grantDirectorAccess(db, context, director);
  }

  /**
   * Copies the director into the new center as its owner account and remembers this
   * device there. Both are what the shell's first-run + auth gates check against the
   * open center's own DB, so seeding them is what lets the director land in the new
   * center without re-running first-run or logging in again. The account keeps the
   * director's id and credential; only the envelope is re-stamped for the new tenant.
   */
  private async grantDirectorAccess(
    db: DB,
    context: { centerCode: CenterCode; deviceOrigin: DeviceId; updatedBy: UserId },
    director: User,
  ): Promise<void> {
    const owner: User = {
      ...director,
      ...newEnvelope(
        { centerCode: context.centerCode, deviceOrigin: context.deviceOrigin, updatedBy: director.id },
        this.deps.clock,
      ),
    };
    const changeLog = new SqliteChangeLogWriter(db, this.deps.clock, context.deviceOrigin);
    await new SqliteUserRepository(db, changeLog).save(owner);
    await new DeviceSessionService(
      new SqliteDeviceSessionStore(db),
      this.deps.clock,
      this.deps.ids,
    ).remember(director.id);
  }

  /**
   * A fresh, collision-free DB-file discriminator: the bare ULID of a generated
   * id. ULIDs are globally unique without a server, so two laptops that add a
   * center offline never pick the same filename.
   */
  private allocateCentreId(): string {
    const generated = this.deps.ids.next('ctr');
    const separator = generated.indexOf('_');
    return separator >= 0 ? generated.slice(separator + 1) : generated;
  }

  private removePartial(file: string): void {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        rmSync(`${file}${suffix}`, { force: true });
      } catch {
        // Best effort: a leftover sidecar is harmless (the center row never
        // committed, so the directory scan won't list it as a real center).
      }
    }
  }
}

/**
 * Derives the tenant code from the globally-unique `centreId`. The tail is the
 * ULID's random component, so a handful of centers on one install never collide;
 * kept short so it reads cleanly on the invoice header.
 */
function deriveCenterCode(centreId: string): CenterCode {
  return `CS-${centreId.slice(-8).toUpperCase()}` as CenterCode;
}

/** The org's billing contact: the center's email, then phone, then its name. */
function billingContactFrom(profile: CenterProfileInput): string {
  if (profile.email !== '') return profile.email;
  if (profile.phone !== '') return profile.phone;
  return profile.name;
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
