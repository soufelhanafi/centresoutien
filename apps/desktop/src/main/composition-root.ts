/// <reference types="vite/client" />
import type { Database as DB } from 'better-sqlite3';
import {
  PLANS,
  PlanPolicy,
  CreateSubject,
  ArchiveSubject,
  ListSubjects,
  GetSubject,
  ListSubjectsWithUsage,
  UpdateSubject,
  CreateFormula,
  UpdateFormula,
  GetFormula,
  ListFormulas,
  CloneFormula,
  DeactivateFormula,
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
  ListGroupsWithCounts,
  GetGroupRoster,
  UpdateGroup,
  ArchiveGroup,
  RestoreGroup,
  CreateStudentSubscription,
  CloseStudentSubscription,
  ListStudentSubscriptions,
  RecordPayment,
  VoidPayment,
  GetInvoicePaymentSummary,
  EnrollStudent,
  UnenrollStudent,
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
  GenerateSessions,
  GenerateAndPersistSessions,
  CreateWeeklyRecurringSession,
  UpdateWeeklyRecurringSession,
  CancelWeeklyRecurringSession,
  CreateAdminAccount,
  VerifyAdminPassword,
  ChangeAdminPassword,
  SaveCenterHours,
  GetCenterHours,
  AttemptLogin,
  LoginThrottlePolicy,
  DeviceSessionService,
  GetCenterProfile,
  SaveCenterProfile,
  StoreCenterLogo,
  ReadCenterLogo,
  CreateBackup,
  GetBackupConfig,
  SaveBackupConfig,
  RestoreBackup,
  RunScheduledBackup,
  CreateTeacherPayrollRule,
  CloseTeacherPayrollRule,
  CreateInvoiceDraft,
  GenerateMonthlyInvoices,
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
  StudentSubscriptionReferencePort,
} from '@centresoutien/domain';
import { openDatabase } from '../data/sqlite/db';
import { applyMigrations, toMigrations } from '../data/sqlite/migration-runner';
import { SqliteSubjectRepository } from '../data/sqlite/repositories/subject-repository';
import { SqliteFormulaRepository } from '../data/sqlite/repositories/formula-repository';
import { SqliteStudentRepository } from '../data/sqlite/repositories/student-repository';
import { SqliteParentRepository } from '../data/sqlite/repositories/parent-repository';
import { SqliteRoomRepository } from '../data/sqlite/repositories/room-repository';
import { SqliteGroupRepository } from '../data/sqlite/repositories/group-repository';
import { SqliteStudentSubscriptionRepository } from '../data/sqlite/repositories/student-subscription-repository';
import { SqliteStudentSubscriptionReference } from '../data/sqlite/repositories/student-subscription-reference';
import { SqliteEnrollmentRepository } from '../data/sqlite/repositories/enrollment-repository';
import { SqliteInvoiceRepository } from '../data/sqlite/repositories/invoice-repository';
import { SqlitePaymentRepository } from '../data/sqlite/repositories/payment-repository';
import { SqliteTeacherRepository } from '../data/sqlite/repositories/teacher-repository';
import { SqliteTeacherPayrollRuleRepository } from '../data/sqlite/repositories/teacher-payroll-rule-repository';
import { SqliteHolidayRepository } from '../data/sqlite/repositories/holiday-repository';
import { SqliteWeeklyRecurringSessionRepository } from '../data/sqlite/repositories/weekly-recurring-session-repository';
import { SqliteSessionRepository } from '../data/sqlite/repositories/session-repository';
import { SqliteCenterHoursRepository } from '../data/sqlite/repositories/center-hours-repository';
import { SqliteAdminAccountRepository } from '../data/sqlite/repositories/admin-account-repository';
import { SqliteLoginThrottleStore } from '../data/sqlite/repositories/login-throttle-store';
import { SqliteDeviceSessionStore } from '../data/sqlite/repositories/device-session-store';
import { SqliteCenterRepository } from '../data/sqlite/repositories/center-repository';
import { FsLogoStore } from '../data/fs/logo-store';
import { SqliteBackupAdapter } from '../data/sqlite/repositories/backup-adapter';
import { SqliteBackupConfigStore } from '../data/sqlite/repositories/backup-config-store';
import { SystemClock } from './infra/system-clock';
import { UlidIdGenerator } from './infra/ulid-id-generator';
import { Argon2PasswordHasher } from './infra/argon2-password-hasher';
import { LocalePreferenceStore, type LocalePreference } from './infra/locale-preference-store';
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
  /** Backup restore (SOU-102) swaps the live DB file and closes its handle —
   *  the app must relaunch to reopen it. Kept out of composition-root/handlers
   *  so they stay Electron-free, mirroring `appVersion`. */
  scheduleRestart: () => void;
};

export type Container = {
  handlerDeps: HandlerDeps;
  /**
   * The real {@link StudentSubscriptionReferencePort} adapter (SOU-63), published so
   * SOU-126 can inject it into `EnrollStudent` when it wires the enrollment
   * persistence + IPC. Nothing consumes it yet on this branch.
   */
  subscriptionReference: StudentSubscriptionReferencePort;
  /**
   * The two payroll-rule use cases (SOU-70), wired here for the first time
   * (SOU-71) so the CRUD UI ticket (SOU-72) can register their IPC routes
   * without touching this file. Not yet exposed through `HandlerDeps` /
   * `createHandlers` — no route consumes them on this branch.
   */
  createTeacherPayrollRule: CreateTeacherPayrollRule;
  closeTeacherPayrollRule: CloseTeacherPayrollRule;
  /** Read once, synchronously, before the window opens — see `LocalePreferenceStore`. */
  readLocalePreference: () => LocalePreference | null;
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
  const listSubjects = new ListSubjects(subjectRepo, plan);
  const getSubject = new GetSubject(subjectRepo, plan);
  const listSubjectsWithUsage = new ListSubjectsWithUsage(subjectRepo, plan);
  const updateSubject = new UpdateSubject(subjectRepo, clock, plan);

  const formulaRepo = new SqliteFormulaRepository(db);
  const createFormula = new CreateFormula(formulaRepo, subjectRepo, clock, ids, plan);
  const updateFormula = new UpdateFormula(formulaRepo, subjectRepo, clock, plan);
  const getFormula = new GetFormula(formulaRepo, plan);
  const listFormulas = new ListFormulas(formulaRepo, plan);
  const cloneFormula = new CloneFormula(formulaRepo, subjectRepo, clock, ids, plan);
  const deactivateFormula = new DeactivateFormula(formulaRepo, clock, plan);

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
  // referenced" stub with no change to ArchiveRoom or the port contract. The same
  // instance also serves WeeklySessionViewReadPort — the planner grid's enriched
  // week (SOU-118), whose join is anchored on this table.
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

  const subscriptionRepo = new SqliteStudentSubscriptionRepository(db);
  const createStudentSubscription = new CreateStudentSubscription(
    subscriptionRepo,
    studentRepo,
    clock,
    ids,
    plan,
  );
  const closeStudentSubscription = new CloseStudentSubscription(subscriptionRepo, clock, plan);
  const listStudentSubscriptions = new ListStudentSubscriptions(subscriptionRepo, plan);
  // The real StudentSubscriptionReferencePort adapter (SOU-63): the coverage query
  // EnrollStudent (SOU-121) needs for its subscription/cross-kind guards. SOU-126 wired
  // EnrollStudent with a null-returning placeholder; this replaces it with the real
  // "does an active subscription cover this subject in this month, and of which kind"
  // query, with no change to the port contract or the use-case body.
  const subscriptionReference: StudentSubscriptionReferencePort =
    new SqliteStudentSubscriptionReference(subscriptionRepo);

  const enrollmentRepo = new SqliteEnrollmentRepository(db);
  const enrollStudent = new EnrollStudent(
    enrollmentRepo,
    groupRepo,
    studentRepo,
    subscriptionReference,
    clock,
    ids,
    plan,
  );
  const unenrollStudent = new UnenrollStudent(enrollmentRepo, clock, plan);
  // Group roster + list-counts read models (SOU-127): the roster resolves a group's
  // live enrollments to student names; list-with-counts reuses ListGroups and adds a
  // single batch enrollment count so the list renders fill % without an N+1.
  const getGroupRoster = new GetGroupRoster(enrollmentRepo, studentRepo, plan);
  const listGroupsWithCounts = new ListGroupsWithCounts(listGroups, enrollmentRepo);

  // Invoicing + the append-only payment ledger (SOU-93). The invoice repository (SOU-67)
  // is constructed here for the first time — payment use cases read the invoice header +
  // its immutable lines to size the balance. RecordPayment appends a `payment` (gating a
  // partial amount on `core.invoicing.partial-paid`); VoidPayment appends a `reversal`
  // (never a delete); GetInvoicePaymentSummary derives the status from the ledger.
  const invoiceRepo = new SqliteInvoiceRepository(db);
  const paymentRepo = new SqlitePaymentRepository(db);
  const recordPayment = new RecordPayment(paymentRepo, invoiceRepo, clock, ids, plan);
  const voidPayment = new VoidPayment(paymentRepo, clock, ids, plan);
  const getInvoicePaymentSummary = new GetInvoicePaymentSummary(paymentRepo, invoiceRepo, plan);
  // The monthly generation job (SOU-68): first caller of CreateInvoiceDraft, which
  // shipped unwired in SOU-67. Idempotent re-runs are CreateInvoiceDraft's own
  // one-invoice-per-student-per-month guard, not a separate check here.
  const createInvoiceDraft = new CreateInvoiceDraft(invoiceRepo, clock, ids, plan);
  const generateMonthlyInvoices = new GenerateMonthlyInvoices(
    subscriptionRepo,
    formulaRepo,
    createInvoiceDraft,
    plan,
  );

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

  // Payroll rule persistence (SOU-71): the domain (SOU-70) and its port shipped
  // first, unwired. This constructs the real SQLite-backed repo and the two
  // use cases against it — createTeacherPayrollRule enforces
  // TooManyActivePayrollRulesError via payrollRuleRepo.listLiveByTeacher;
  // closeTeacherPayrollRule caps a live rule's endMonth. IPC wiring lands with
  // the CRUD UI (SOU-72).
  const payrollRuleRepo = new SqliteTeacherPayrollRuleRepository(db);
  const createTeacherPayrollRule = new CreateTeacherPayrollRule(
    payrollRuleRepo,
    teacherRepo,
    clock,
    ids,
    plan,
  );
  const closeTeacherPayrollRule = new CloseTeacherPayrollRule(payrollRuleRepo, clock, plan);

  const holidayRepo = new SqliteHolidayRepository(db);
  const createHoliday = new CreateHoliday(holidayRepo, clock, ids, plan);
  const listHolidays = new ListHolidays(holidayRepo, plan);
  const updateHoliday = new UpdateHoliday(holidayRepo, clock, plan);
  const archiveHoliday = new ArchiveHoliday(holidayRepo, clock, plan);
  const restoreHoliday = new RestoreHoliday(holidayRepo, clock, plan);

  // Concrete dated sessions (SOU-129): the SOU-56 generator is pure, so the plan
  // gate + persistence live here. GenerateAndPersistSessions resolves the
  // recurrence template (the WRS repo above) and the center's holidays, runs the
  // pure generator, and upserts idempotently on (recurringSessionId, date).
  const concreteSessionRepo = new SqliteSessionRepository(db);
  const generateSessions = new GenerateAndPersistSessions(
    concreteSessionRepo,
    sessionRepo,
    holidayRepo,
    new GenerateSessions(clock, ids),
    plan,
  );

  const centerRepo = new SqliteCenterRepository(db);
  const getCenterProfile = new GetCenterProfile(centerRepo);
  const saveCenterProfile = new SaveCenterProfile(centerRepo, clock, ids);
  const logoStore = new FsLogoStore(options.dir, ids);
  const storeCenterLogo = new StoreCenterLogo(logoStore);
  const readCenterLogo = new ReadCenterLogo(logoStore);

  // Backup & restore (SOU-102). `options.key` is today's key-management
  // mechanism (CS_DB_KEY / dev fallback) — real per-center key derivation is a
  // separate future ticket; both the manual/scheduled snapshot path and the
  // restore verify/swap path use it unchanged until then.
  const backupConfigStore = new SqliteBackupConfigStore(db);
  const backupAdapter = new SqliteBackupAdapter(db, options.key, ids);
  const createBackup = new CreateBackup(backupAdapter, backupConfigStore);
  const getBackupConfig = new GetBackupConfig(backupConfigStore);
  const saveBackupConfig = new SaveBackupConfig(backupConfigStore);
  const restoreBackup = new RestoreBackup(backupAdapter);
  // Launch-time schedule check (KICKOFF: no OS-level cron — runs at most once
  // per launch, no-ops until a destination folder is configured). Fire-and-
  // forget: a backup failure (unmounted USB, full disk…) must never block the
  // window from opening.
  void new RunScheduledBackup(backupAdapter, backupConfigStore, clock)
    .execute({ centerCode: options.centerCode })
    .catch((error: unknown) => console.error('[backup] scheduled run failed', error));

  const centerHoursRepo = new SqliteCenterHoursRepository(db);
  const saveCenterHours = new SaveCenterHours(centerHoursRepo, clock, ids, plan);
  const getCenterHours = new GetCenterHours(centerHoursRepo, plan);

  // Weekly recurring session write path (SOU-131): create/update run the SOU-55
  // composite conflict check (room + teacher + hours) against the same
  // `sessionRepo` that backs the planner read + the ArchiveRoom guard, reading the
  // center's configured week from `centerHoursRepo`. Cancel is a soft delete. All
  // three gate `core.calendar.week` in the domain.
  const createWeeklySession = new CreateWeeklyRecurringSession(
    sessionRepo,
    centerHoursRepo,
    clock,
    ids,
    plan,
  );
  const updateWeeklySession = new UpdateWeeklyRecurringSession(
    sessionRepo,
    centerHoursRepo,
    clock,
    plan,
  );
  const cancelWeeklySession = new CancelWeeklyRecurringSession(sessionRepo, clock, plan);

  const hasher = new Argon2PasswordHasher();
  const adminRepo = new SqliteAdminAccountRepository(db);
  const createAdminAccount = new CreateAdminAccount(adminRepo, hasher, clock, ids);
  const verifyAdminPassword = new VerifyAdminPassword(adminRepo, hasher);
  const changeAdminPassword = new ChangeAdminPassword(adminRepo, hasher, clock);

  // Locale preference (SOU-31): a plain userData-file adapter, not a domain
  // port — see LocalePreferenceStore's doc for why. `options.dir` is the same
  // userData directory the center DB files and the logo store live under.
  const localePreferences = new LocalePreferenceStore(options.dir);

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
    listSubjects,
    getSubject,
    listSubjectsWithUsage,
    updateSubject,
    createFormula,
    updateFormula,
    getFormula,
    listFormulas,
    cloneFormula,
    deactivateFormula,
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
    listGroupsWithCounts,
    getGroupRoster,
    updateGroup,
    archiveGroup,
    restoreGroup,
    createStudentSubscription,
    closeStudentSubscription,
    listStudentSubscriptions,
    recordPayment,
    voidPayment,
    getInvoicePaymentSummary,
    generateMonthlyInvoices,
    enrollStudent,
    unenrollStudent,
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
    generateSessions,
    createWeeklySession,
    updateWeeklySession,
    cancelWeeklySession,
    saveCenterHours,
    getCenterHours,
    envelopeContext: () => context,
    adminExists: () => adminRepo.exists(),
    createAdminAccount,
    verifyAdminPassword,
    changeAdminPassword,
    attemptLogin,
    deviceSessions,
    getCenterProfile,
    saveCenterProfile,
    storeCenterLogo,
    readCenterLogo,
    centerContext: () => centerContext,
    saveLocalePreference: (locale) => localePreferences.write(locale),
    createBackup,
    getBackupConfig,
    saveBackupConfig,
    restoreBackup,
    activeCenterCode: () => options.centerCode,
    dbKey: () => options.key,
    scheduleRestart: options.scheduleRestart,
  };

  return {
    handlerDeps,
    subscriptionReference,
    createTeacherPayrollRule,
    closeTeacherPayrollRule,
    readLocalePreference: () => localePreferences.read(),
    // `db.open` guards against a double-close: a successful restore (SOU-102)
    // already closed this handle as part of its file swap, and `will-quit`
    // still calls `dispose()` during the scheduled relaunch.
    dispose: () => {
      if (db.open) db.close();
    },
  };
}

/** Convenience: build the container and its IPC handler set together. */
export function buildHandlers(options: ContainerOptions) {
  const container = buildContainer(options);
  return { handlers: createHandlers(container.handlerDeps), dispose: container.dispose };
}
