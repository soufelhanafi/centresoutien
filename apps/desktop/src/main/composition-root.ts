/// <reference types="vite/client" />
import type { Database as DB } from 'better-sqlite3';
import {
  PLANS,
  PlanPolicy,
  CreateSubject,
  ArchiveSubject,
  CreateStudent,
  ListStudents,
  GetStudent,
  UpdateStudent,
  ArchiveStudent,
  CreateParent,
  ListParents,
  GetParent,
  UpdateParent,
  ArchiveParent,
  ListParentChildren,
  CreateRoom,
  ListRooms,
  UpdateRoom,
  ArchiveRoom,
  RestoreRoom,
  CreateGroup,
  ListGroups,
  UpdateGroup,
  ArchiveGroup,
  RestoreGroup,
  CreateTeacher,
  ListTeachers,
  GetTeacher,
  UpdateTeacher,
  ArchiveTeacher,
  RestoreTeacher,
  CreateHoliday,
  ListHolidays,
  UpdateHoliday,
  ArchiveHoliday,
  RestoreHoliday,
  ListWeekSessions,
  CreateAdminAccount,
  VerifyAdminPassword,
  SaveCenterHours,
  GetCenterHours,
  AttemptLogin,
  LoginThrottlePolicy,
  DeviceSessionService,
  GetCenterProfile,
  SaveCenterProfile,
  StoreCenterLogo,
  ReadCenterLogo,
} from '@centresoutien/domain';
import type {
  PlanId,
  CenterCode,
  DeviceId,
  UserId,
  IdGenerator,
  RoomReferencePort,
  SubjectReferencePort,
  TeacherReferencePort,
} from '@centresoutien/domain';
import { openDatabase } from '../data/sqlite/db';
import { applyMigrations, toMigrations } from '../data/sqlite/migration-runner';
import { SqliteSubjectRepository } from '../data/sqlite/repositories/subject-repository';
import { SqliteStudentRepository } from '../data/sqlite/repositories/student-repository';
import { SqliteParentRepository } from '../data/sqlite/repositories/parent-repository';
import { SqliteRoomRepository } from '../data/sqlite/repositories/room-repository';
import { SqliteGroupRepository } from '../data/sqlite/repositories/group-repository';
import { SqliteTeacherRepository } from '../data/sqlite/repositories/teacher-repository';
import { SqliteHolidayRepository } from '../data/sqlite/repositories/holiday-repository';
import { SqliteWeeklyRecurringSessionRepository } from '../data/sqlite/repositories/weekly-recurring-session-repository';
import { SqliteCenterHoursRepository } from '../data/sqlite/repositories/center-hours-repository';
import { SqliteAdminAccountRepository } from '../data/sqlite/repositories/admin-account-repository';
import { SqliteLoginThrottleStore } from '../data/sqlite/repositories/login-throttle-store';
import { SqliteDeviceSessionStore } from '../data/sqlite/repositories/device-session-store';
import { SqliteCenterRepository } from '../data/sqlite/repositories/center-repository';
import { FsLogoStore } from '../data/fs/logo-store';
import { SystemClock } from './infra/system-clock';
import { UlidIdGenerator } from './infra/ulid-id-generator';
import { Argon2PasswordHasher } from './infra/argon2-password-hasher';
import {
  createHandlers,
  type HandlerDeps,
  type EnvelopeContext,
  type CenterContext,
} from './ipc/handlers';

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
 * The active plan, read once at startup from the center row (SOU-28 interim gate
 * source). Falls back to `fallback` (the dev/license override) before the center
 * profile has ever been saved. SOU-98 replaces this with a tamper-evident
 * license file — until then this is honest-user enforcement, as CLAUDE.md §5quater
 * accepts for the desktop tier.
 */
function resolvePlanId(db: DB, fallback: PlanId): PlanId {
  const row = db.prepare('SELECT plan FROM center WHERE deleted_at IS NULL LIMIT 1').get() as
    | { plan: string }
    | undefined;
  if (row && (row.plan === 'essentiel' || row.plan === 'pro' || row.plan === 'premium')) {
    return row.plan;
  }
  return fallback;
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
  const activePlanId = resolvePlanId(db, options.planId);
  const plan = new PlanPolicy(PLANS[activePlanId]);

  const subjectRepo = new SqliteSubjectRepository(db);
  const createSubject = new CreateSubject(subjectRepo, clock, ids, plan);

  const studentRepo = new SqliteStudentRepository(db);
  const createStudent = new CreateStudent(studentRepo, clock, ids, plan);
  const listStudents = new ListStudents(studentRepo, plan);
  const getStudent = new GetStudent(studentRepo, plan);
  const updateStudent = new UpdateStudent(studentRepo, clock, plan);
  const archiveStudent = new ArchiveStudent(studentRepo, clock, plan);

  const parentRepo = new SqliteParentRepository(db);
  const createParent = new CreateParent(parentRepo, clock, ids, plan);
  const listParents = new ListParents(parentRepo, plan);
  const getParent = new GetParent(parentRepo, plan);
  const updateParent = new UpdateParent(parentRepo, clock, plan);
  const archiveParent = new ArchiveParent(parentRepo, clock, plan);
  const listParentChildren = new ListParentChildren(studentRepo, plan);

  const roomRepo = new SqliteRoomRepository(db);
  // The weekly-session repository (SOU-53) is the real backing for the ArchiveRoom
  // in-use guard: it owns the query over live sessions, so it also satisfies
  // RoomReferencePort. Passing the same instance replaces the SOU-33 "never
  // referenced" stub with no change to ArchiveRoom or the port contract.
  const sessionRepo = new SqliteWeeklyRecurringSessionRepository(db);
  const roomReference: RoomReferencePort = sessionRepo;
  const listWeekSessions = new ListWeekSessions(sessionRepo, plan);
  const createRoom = new CreateRoom(roomRepo, clock, ids, plan);
  const listRooms = new ListRooms(roomRepo, plan);
  const updateRoom = new UpdateRoom(roomRepo, clock, plan);
  const archiveRoom = new ArchiveRoom(roomRepo, roomReference, clock, plan);
  const restoreRoom = new RestoreRoom(roomRepo, clock, plan);

  const groupRepo = new SqliteGroupRepository(db);
  const createGroup = new CreateGroup(groupRepo, roomRepo, subjectRepo, clock, ids, plan);
  const listGroups = new ListGroups(groupRepo, plan);
  const updateGroup = new UpdateGroup(groupRepo, roomRepo, subjectRepo, clock, plan);
  const archiveGroup = new ArchiveGroup(groupRepo, clock, plan);
  const restoreGroup = new RestoreGroup(groupRepo, clock, plan);

  // `groups` is the only table that carries `subject_id` today, so the group
  // repository owns the query the ArchiveSubject in-use guard needs and satisfies
  // SubjectReferencePort (SOU-46). Passing the same instance backs the guard with
  // real live-group counting, mirroring how sessionRepo backs RoomReferencePort;
  // sessions/formulas join the scope inside the adapter once they reference
  // subjects, with no change here or to ArchiveSubject.
  const subjectReference: SubjectReferencePort = groupRepo;
  const archiveSubject = new ArchiveSubject(subjectRepo, subjectReference, clock, plan);

  const teacherRepo = new SqliteTeacherRepository(db);
  // The teacher in-use guard's real backing (a query over live groups / sessions /
  // payroll rules) lands with Groups (SOU-48) and payroll (SOU-70). Until then no
  // teacher can be referenced: a stub reporting "never referenced" is correct, not
  // a placeholder — those tickets swap in the real adapter here, unchanged
  // elsewhere. (TeacherReferencePort is a declared-only contract; see its doc.)
  const teacherReference: TeacherReferencePort = {
    hasReferencesForTeacher: async () => false,
  };
  const createTeacher = new CreateTeacher(teacherRepo, clock, ids, plan);
  const listTeachers = new ListTeachers(teacherRepo, plan);
  const getTeacher = new GetTeacher(teacherRepo, plan);
  const updateTeacher = new UpdateTeacher(teacherRepo, clock, plan);
  const archiveTeacher = new ArchiveTeacher(teacherRepo, teacherReference, clock, plan);
  const restoreTeacher = new RestoreTeacher(teacherRepo, clock, plan);

  const holidayRepo = new SqliteHolidayRepository(db);
  const createHoliday = new CreateHoliday(holidayRepo, clock, ids, plan);
  const listHolidays = new ListHolidays(holidayRepo, plan);
  const updateHoliday = new UpdateHoliday(holidayRepo, clock, plan);
  const archiveHoliday = new ArchiveHoliday(holidayRepo, clock, plan);
  const restoreHoliday = new RestoreHoliday(holidayRepo, clock, plan);

  const centerRepo = new SqliteCenterRepository(db);
  const getCenterProfile = new GetCenterProfile(centerRepo);
  const saveCenterProfile = new SaveCenterProfile(centerRepo, clock, ids);
  const logoStore = new FsLogoStore(options.dir, ids);
  const storeCenterLogo = new StoreCenterLogo(logoStore);
  const readCenterLogo = new ReadCenterLogo(logoStore);

  const centerHoursRepo = new SqliteCenterHoursRepository(db);
  const saveCenterHours = new SaveCenterHours(centerHoursRepo, clock, ids, plan);
  const getCenterHours = new GetCenterHours(centerHoursRepo, plan);

  const hasher = new Argon2PasswordHasher();
  const adminRepo = new SqliteAdminAccountRepository(db);
  const createAdminAccount = new CreateAdminAccount(adminRepo, hasher, clock, ids);
  const verifyAdminPassword = new VerifyAdminPassword(adminRepo, hasher);

  const deviceSessions = new DeviceSessionService(new SqliteDeviceSessionStore(db), clock, ids);
  const attemptLogin = new AttemptLogin(
    verifyAdminPassword,
    new SqliteLoginThrottleStore(db),
    new LoginThrottlePolicy(),
    deviceSessions,
    clock,
  );

  const context: EnvelopeContext = {
    centerCode: options.centerCode,
    deviceOrigin: resolveDeviceOrigin(db, ids),
    updatedBy: DEV_USER,
  };
  const centerContext: CenterContext = { ...context, seedPlan: activePlanId };

  const handlerDeps: HandlerDeps = {
    appVersion: options.appVersion,
    activePlanId: () => activePlanId,
    createSubject,
    archiveSubject,
    createStudent,
    listStudents,
    getStudent,
    updateStudent,
    archiveStudent,
    createParent,
    listParents,
    getParent,
    updateParent,
    archiveParent,
    listParentChildren,
    createRoom,
    listRooms,
    updateRoom,
    archiveRoom,
    restoreRoom,
    createGroup,
    listGroups,
    updateGroup,
    archiveGroup,
    restoreGroup,
    createTeacher,
    listTeachers,
    getTeacher,
    updateTeacher,
    archiveTeacher,
    restoreTeacher,
    createHoliday,
    listHolidays,
    updateHoliday,
    archiveHoliday,
    restoreHoliday,
    listWeekSessions,
    saveCenterHours,
    getCenterHours,
    envelopeContext: () => context,
    adminExists: () => adminRepo.exists(),
    createAdminAccount,
    verifyAdminPassword,
    attemptLogin,
    deviceSessions,
    getCenterProfile,
    saveCenterProfile,
    storeCenterLogo,
    readCenterLogo,
    centerContext: () => centerContext,
  };

  return { handlerDeps, dispose: () => db.close() };
}

/** Convenience: build the container and its IPC handler set together. */
export function buildHandlers(options: ContainerOptions) {
  const container = buildContainer(options);
  return { handlers: createHandlers(container.handlerDeps), dispose: container.dispose };
}
