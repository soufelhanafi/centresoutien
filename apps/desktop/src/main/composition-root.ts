/// <reference types="vite/client" />
import type { Database as DB } from 'better-sqlite3';
import {
  PLANS,
  PlanPolicy,
  CreateSubject,
  CreateAdminAccount,
  VerifyAdminPassword,
} from '@centresoutien/domain';
import type { PlanId, CenterCode, DeviceId, UserId, IdGenerator } from '@centresoutien/domain';
import { openDatabase } from '../data/sqlite/db';
import { applyMigrations, toMigrations } from '../data/sqlite/migration-runner';
import { SqliteSubjectRepository } from '../data/sqlite/repositories/subject-repository';
import { SqliteAdminAccountRepository } from '../data/sqlite/repositories/admin-account-repository';
import { SystemClock } from './infra/system-clock';
import { UlidIdGenerator } from './infra/ulid-id-generator';
import { Argon2PasswordHasher } from './infra/argon2-password-hasher';
import { createHandlers, type HandlerDeps, type SubjectContext } from './ipc/handlers';

// Migration SQL is bundled into the main process at build time (no runtime file
// read — survives packaging/asar). Vitest resolves the same glob from source.
const migrationFiles = import.meta.glob('../data/sqlite/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// TODO(auth): real editor identity arrives with user accounts. Until then every
// write is attributed to a single local placeholder user.
const DEV_USER = 'usr_local-device' as UserId;

export type ContainerOptions = {
  centreId: string; // database-file discriminator
  centerCode: CenterCode; // tenant code stamped on entities
  key: string; // SQLCipher passphrase (real key management is a later ticket)
  dir: string; // directory holding the center DB files
  planId: PlanId;
  appVersion: () => string;
};

export type Container = {
  handlerDeps: HandlerDeps;
  dispose: () => void;
};

/** Read the device's stable origin id, generating and persisting it on first run. */
function resolveDeviceOrigin(db: DB, ids: IdGenerator): DeviceId {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = 'device_origin'").get() as
    | { value: string }
    | undefined;
  if (row) return row.value as DeviceId;
  const id = ids.next('dev');
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('device_origin', id);
  return id as DeviceId;
}

/**
 * The one place concrete adapters are constructed and injected into use cases.
 * Opens the center database, migrates it, wires the SQLite repositories to the
 * domain use cases, and exposes them as IPC handler dependencies.
 */
export function buildContainer(options: ContainerOptions): Container {
  const db = openDatabase({ centreId: options.centreId, key: options.key, dir: options.dir });
  applyMigrations(db, toMigrations(migrationFiles));

  const clock = new SystemClock();
  const ids = new UlidIdGenerator();
  const plan = new PlanPolicy(PLANS[options.planId]);

  const subjectRepo = new SqliteSubjectRepository(db);
  const createSubject = new CreateSubject(subjectRepo, clock, ids, plan);

  const hasher = new Argon2PasswordHasher();
  const adminRepo = new SqliteAdminAccountRepository(db);
  const createAdminAccount = new CreateAdminAccount(adminRepo, hasher, clock, ids);
  const verifyAdminPassword = new VerifyAdminPassword(adminRepo, hasher);

  const context: SubjectContext = {
    centerCode: options.centerCode,
    deviceOrigin: resolveDeviceOrigin(db, ids),
    updatedBy: DEV_USER,
  };

  const handlerDeps: HandlerDeps = {
    appVersion: options.appVersion,
    activePlanId: () => options.planId,
    createSubject,
    subjectContext: () => context,
    adminExists: () => adminRepo.exists(),
    createAdminAccount,
    verifyAdminPassword,
  };

  return { handlerDeps, dispose: () => db.close() };
}

/** Convenience: build the container and its IPC handler set together. */
export function buildHandlers(options: ContainerOptions) {
  const container = buildContainer(options);
  return { handlers: createHandlers(container.handlerDeps), dispose: container.dispose };
}
