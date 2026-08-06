/// <reference types="vite/client" />
import type { Database as DB } from 'better-sqlite3';
import { join } from 'node:path';
import {
  PLANS,
  PlanPolicy,
  resolveActivePlan,
  isRestrictedMode,
  ActivateLicense,
  GetLicenseStatus,
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
  SetStudentGuardians,
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
  ReplaceStudentSubscription,
  ListStudentSubscriptions,
  RecordPayment,
  VoidPayment,
  GetInvoicePaymentSummary,
  EnrollStudent,
  UnenrollStudent,
  CreateTeacher,
  ListTeachers,
  SearchPeople,
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
  UndoGenerationBatch,
  CreateWeeklyRecurringSession,
  UpdateWeeklyRecurringSession,
  CancelWeeklyRecurringSession,
  SessionGenerator,
  PreviewGeneratedSchedule,
  CommitGeneratedSchedule,
  CreateAdminAccount,
  VerifyAdminPassword,
  ChangeAdminPassword,
  GenerateRecoveryCodes,
  VerifyRecoveryCode,
  ResetPasswordWithRecoveryCode,
  SetSecurityQuestions,
  VerifySecurityAnswers,
  RequestPasswordResetViaSecurityQuestions,
  SecurityQuestionThrottlePolicy,
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
  ExportBackup,
  PreviewImportBackup,
  ApplyImportBackup,
  CreateTeacherPayrollRule,
  CloseTeacherPayrollRule,
  ReplaceTeacherPayrollRule,
  ListTeacherPayrollRulesByTeacher,
  CreateInvoiceDraft,
  GenerateMonthlyInvoices,
  ListInvoices,
  ListOverdueInvoices,
  IssueInvoice,
  CancelInvoice,
  MonthlyFeeAttributionService,
  ComputeMonthlyPayrolls,
  ConfirmTeacherPayout,
  ConfirmMonthlyPayrolls,
  ListTeacherPayouts,
  GetTeacherAttributionBreakdown,
  GeneratePayslipPdf,
  GeneratePaymentReceiptPdf,
  RecordSessionAttendance,
  GetDashboardBasicSummary,
  GetDashboardAdvancedSummary,
  GetStudentAttendanceReport,
  GetGroupAttendanceSheet,
} from '@centresoutien/domain';
import type {
  PlanId,
  CenterCode,
  DeviceId,
  UserId,
  Clock,
  LicensePort,
  LicenseBindingContext,
  IdGenerator,
  RoomReferencePort,
  SubjectReferencePort,
  TeacherReferencePort,
  StudentSubscriptionReferencePort,
  SyncHubPort,
} from '@centresoutien/domain';
import { Ed25519LicenseAdapter } from '../data/license/ed25519-license-adapter';
import { FsLicenseStore } from '../data/license/fs-license-store';
import { FileMachineIdentity } from '../data/license/file-machine-identity';
import { licenseFileNameForCenter } from '../data/license/license-file-path';
import { VENDOR_LICENSE_PUBLIC_KEY_PEM } from '../data/license/vendor-public-key';
import { openDatabase } from '../data/sqlite/db';
import { applyMigrations, toMigrations } from '../data/sqlite/migration-runner';
import { SqliteHubStore } from '../data/sqlite/hub/hub-store';
import { HubServer } from './hub-server/hub-server';
import { HttpSyncHubClient } from '../data/sync/http-sync-hub-client';
import { SqliteSubjectRepository } from '../data/sqlite/repositories/subject-repository';
import { SqliteChangeLogWriter } from '../data/sqlite/change-log/sqlite-change-log-writer';
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
import { SqliteTeacherPayoutRepository } from '../data/sqlite/repositories/teacher-payout-repository';
import { SqliteHolidayRepository } from '../data/sqlite/repositories/holiday-repository';
import { SqliteWeeklyRecurringSessionRepository } from '../data/sqlite/repositories/weekly-recurring-session-repository';
import { SqliteSessionRepository } from '../data/sqlite/repositories/session-repository';
import { SqliteAttendanceRepository } from '../data/sqlite/repositories/attendance-repository';
import { SqliteCenterHoursRepository } from '../data/sqlite/repositories/center-hours-repository';
import { SqliteAdminAccountRepository } from '../data/sqlite/repositories/admin-account-repository';
import { SqliteRecoveryCodeRepository } from '../data/sqlite/repositories/recovery-code-repository';
import { SqliteSecurityQuestionRepository } from '../data/sqlite/repositories/security-question-repository';
import { SqliteAuthAuditLogRepository } from '../data/sqlite/repositories/auth-audit-log-repository';
import { SqliteLoginThrottleStore } from '../data/sqlite/repositories/login-throttle-store';
import { SqliteSecurityQuestionThrottleStore } from '../data/sqlite/repositories/security-question-throttle-store';
import { SqliteDeviceSessionStore } from '../data/sqlite/repositories/device-session-store';
import { SqliteCenterRepository } from '../data/sqlite/repositories/center-repository';
import { FsLogoStore } from '../data/fs/logo-store';
import { SqliteBackupAdapter } from '../data/sqlite/repositories/backup-adapter';
import { SqliteBackupConfigStore } from '../data/sqlite/repositories/backup-config-store';
import { SqliteBackupStore } from '../data/sqlite/repositories/backup-store';
import { ExcelBackupAdapter } from '../data/excel/backup-excel-adapter';
import { DialogPathRegistry } from './ipc/dialog-path-registry';
import { PdfLibInvoiceRenderer } from '../data/pdf/pdf-lib-invoice-renderer';
import { PdfLibPayslipRenderer } from '../data/pdf/pdf-lib-payslip-renderer';
import { PdfLibPaymentReceiptRenderer } from '../data/pdf/pdf-lib-payment-receipt-renderer';
import { PdfLibScheduleRenderer } from '../data/pdf/pdf-lib-schedule-renderer';
import { SystemClock } from './infra/system-clock';
import { UlidIdGenerator } from './infra/ulid-id-generator';
import { Argon2PasswordHasher } from './infra/argon2-password-hasher';
import { NodeSecureRandom } from './infra/node-secure-random';
import { NodeRandomPort } from './infra/node-random-port';
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

// The embedded hub's canonical store has its own migration chain (SOU-90) — a
// separate SQLCipher file per center, so its `_schema_migrations` is distinct.
const hubMigrationFiles = import.meta.glob('../data/sqlite/hub/migrations/*.sql', {
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
  /** Test-only injection seam (SOU-98): integration tests pass a real
   *  {@link Ed25519LicenseAdapter} built from a test keypair + written license
   *  file instead of relying on the DEV-only `CS_LICENSE_*` env overrides, which
   *  a production build never reads. Undefined in production. */
  license?: LicensePort;
  /**
   * Embedded LAN hub (SOU-90): when present, the composition root opens the
   * hub's canonical store, starts the HTTP listener, and wires the HTTP
   * `SyncHubPort` client for this center. Absent by default — designating a
   * laptop as hub (and its real config UX) is a later ticket; for now `index.ts`
   * opts in via `CS_HUB_ENABLED`/`CS_HUB_TOKEN`. `bindHost` selects the LAN
   * interface the listener serves (SOU-90 review Major 2 — never expose the hub
   * beyond the local network); it is REQUIRED and must be a non-wildcard host.
   */
  hubServer?: { port: number; token: string; bindHost: string };
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
   * The embedded hub's {@link SyncHubPort} client (SOU-90) for the open center —
   * the seam the sync engine (SOU-81) will drive. Always an HTTP client bound to
   * the hub host's own `127.0.0.1` when the hub is enabled, so the hub laptop is
   * never special-cased. Null when the hub is disabled.
   */
  syncHub: SyncHubPort | null;
  /** Read once, synchronously, before the window opens — see `LocalePreferenceStore`. */
  readLocalePreference: () => LocalePreference | null;
  /**
   * The live restricted-mode gate (SOU-104): `true` while the license is non-active,
   * so the IPC dispatcher answers only `license.status` / `license.activate`. Passed
   * to `registerIpc`; re-evaluated per call, never a startup snapshot. This is the
   * server-side hard lock that supersedes the deferred SOU-173.
   */
  isRestricted: () => boolean;
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
 * The active plan, resolved once at startup from the tamper-evident license file
 * (SOU-98/SOU-104). A verified, unexpired, correctly-bound license yields its
 * tier; every other state (missing / bad-signature / expired / wrong-machine /
 * wrong-center) is a HARD LOCK: the renderer, driven by the `license.status` IPC
 * (`restricted === status !== 'active'`), confines the whole app to the
 * activation screen, so no gated use case ever runs behind this resolution.
 *
 * Because nothing runs behind the lock, a non-active license must NEVER grant a
 * usable tier in a packaged build — it resolves to `essentiel` purely so
 * `PlanPolicy` has a `Plan` to construct from, gated shut anyway. The DEV-only
 * override (`options.planId`, fed by CS_PLAN / CS_LICENSE_*) is honored only when
 * `isDev`, for local ergonomics; production never self-upgrades from a bad
 * license. The user-editable `center.plan` row is never consulted either.
 */
export function resolveStartupPlanId(
  license: LicensePort,
  clock: Clock,
  binding: LicenseBindingContext,
  devFallback: PlanId,
  isDev: boolean,
): PlanId {
  const resolution = resolveActivePlan(license.verify(), clock.now(), binding);
  if (resolution.status === 'active') return resolution.plan.id;
  return isDev ? devFallback : 'essentiel';
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
  // Trust anchor + license path are fixed in a packaged build so a user cannot
  // point them at a self-signed keypair to self-upgrade (SOU-98). The path is
  // scoped per center (SOU-104 M2, CLAUDE.md §5ter) — each center owns its own
  // license, so a multi-center owner activating center B never clobbers center
  // A's file. The read (adapter) and write (store) paths share this one value,
  // so they always agree. The `CS_LICENSE_*` env overrides exist purely for
  // local-dev ergonomics and are DEV-gated the same way `plan.set` is —
  // `import.meta.env.DEV` is a build-time constant electron-vite replaces with
  // `false` in production, tree-shaking the override path out. Tests inject
  // through `options.license`, never the env.
  const licenseFilePath = import.meta.env.DEV
    ? (process.env['CS_LICENSE_FILE'] ??
      join(options.dir, licenseFileNameForCenter(options.centerCode)))
    : join(options.dir, licenseFileNameForCenter(options.centerCode));
  const license =
    options.license ??
    new Ed25519LicenseAdapter({
      filePath: licenseFilePath,
      publicKey: import.meta.env.DEV
        ? (process.env['CS_LICENSE_PUBLIC_KEY'] ?? VENDOR_LICENSE_PUBLIC_KEY_PEM)
        : VENDOR_LICENSE_PUBLIC_KEY_PEM,
    });
  // Machine-scoped id (SOU-104) — the anchor for the license's machine binding.
  // A file beside the center DBs, not inside one, so every center on this laptop
  // shares it. The activation flow and startup resolution both check against it.
  const machineIdentity = new FileMachineIdentity(options.dir);
  const licenseBinding: LicenseBindingContext = {
    machineId: machineIdentity.machineId(),
    centerCode: options.centerCode,
  };
  const activePlanId = resolveStartupPlanId(
    license,
    clock,
    licenseBinding,
    options.planId,
    import.meta.env.DEV,
  );
  const plan = new PlanPolicy(PLANS[activePlanId]);

  // The server-side restricted-mode hard lock (SOU-104), superseding the deferred
  // SOU-173. Until the license resolves to `active`, the IPC dispatcher answers
  // only `license.status` / `license.activate` — every other channel is rejected
  // with `LicenseRestrictedError`, so the lock no longer lives only in the renderer.
  // Evaluated LIVE on each guarded call (`license.verify()` re-reads the file), so a
  // successful `license.activate` — which rewrites that same file and flips the plan
  // — unblocks the other channels in the same process with no restart. A dev build
  // with no injected license keeps the `CS_LICENSE_*` / `options.planId` override
  // ergonomics (never restricted); tests inject `options.license`, exercising the
  // real production lock.
  const devOverrideActive = import.meta.env.DEV && options.license === undefined;
  const isRestricted = (): boolean =>
    devOverrideActive
      ? false
      : isRestrictedMode(resolveActivePlan(license.verify(), clock.now(), licenseBinding).status);

  // License activation (SOU-104): the activation screen's two channels. `activate`
  // verifies a pasted/imported envelope, checks it binds to this machine + center
  // and hasn't expired, then persists it and flips the live plan; `status` reports
  // the installed license's resolved state for the screen + Settings. The store
  // writes to the same fixed `licenseFilePath` the startup adapter reads.
  const licenseStore = new FsLicenseStore(licenseFilePath);
  const activateLicense = new ActivateLicense(
    license,
    licenseStore,
    machineIdentity,
    clock,
    plan,
    options.centerCode,
  );
  const getLicenseStatus = new GetLicenseStatus(license, machineIdentity, clock, options.centerCode);

  // The acting laptop, resolved once — stamped on every change_log row (SOU-79)
  // and carried in the envelope context below.
  const deviceOrigin = resolveDeviceOrigin(db, ids);
  const changeLog = new SqliteChangeLogWriter(db, clock, deviceOrigin);

  const subjectRepo = new SqliteSubjectRepository(db, changeLog);
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
  const setStudentGuardians = new SetStudentGuardians(studentRepo, parentRepo, clock, plan);

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
  // Weekly schedule PDF export (SOU-107): no domain use case sits between
  // `ListWeekSessions` and this renderer — the IPC handler filters the
  // already-fetched week to the requested view itself (`schedule-pdf-assembly.ts`).
  const scheduleRenderer = new PdfLibScheduleRenderer();
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
  const replaceStudentSubscription = new ReplaceStudentSubscription(
    subscriptionRepo,
    studentRepo,
    clock,
    ids,
    plan,
  );
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
  // Invoice list/detail/print/export (SOU-69): the read model (SOU-69 domain)
  // reused for both the filterable list screen and single-invoice detail
  // fetches, plus the pdf-lib adapter the print/export IPC handlers assemble
  // into an InvoicePdfInput (student name + center profile + this invoice's
  // own already-derived totals).
  const listInvoices = new ListInvoices(invoiceRepo, plan);
  const invoicePdfRenderer = new PdfLibInvoiceRenderer();
  // Issue / cancel (SOU-143): the two lifecycle transitions shipped unwired
  // alongside CreateInvoiceDraft in SOU-67 (KICKOFF, SOU-69) — thin IPC plumbing
  // only, no new domain logic.
  const issueInvoice = new IssueInvoice(invoiceRepo, clock, plan);
  const cancelInvoice = new CancelInvoice(invoiceRepo, clock, plan);
  // Impayés (arrears) list (SOU-103): no new repository — `invoiceRepo` also
  // implements `OverdueInvoiceViewReadPort` (its join is anchored on `invoices`,
  // mirroring the WeeklySessionViewReadPort/WeeklyRecurringSessionRepository
  // pairing), and `parentRepo` resolves the guardian contacts to group by.
  const listOverdueInvoices = new ListOverdueInvoices(invoiceRepo, parentRepo, clock, plan);

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
  const searchPeople = new SearchPeople(listStudents, listTeachers, listParents);
  const getTeacher = new GetTeacher(teacherRepo, plan);
  const updateTeacher = new UpdateTeacher(teacherRepo, clock, plan);
  const archiveTeacher = new ArchiveTeacher(teacherRepo, teacherReference, clock, plan);
  const restoreTeacher = new RestoreTeacher(teacherRepo, clock, plan);

  // Payroll rule persistence (SOU-71) + the Rule tab's IPC surface (SOU-72):
  // createTeacherPayrollRule enforces TooManyActivePayrollRulesError via
  // payrollRuleRepo.listLiveByTeacher; closeTeacherPayrollRule caps a live
  // rule's endMonth; listTeacherPayrollRulesByTeacher backs the Active/History
  // split, resolving the teacher first so a foreign-center id can never
  // enumerate another tenant's rules.
  const payrollRuleRepo = new SqliteTeacherPayrollRuleRepository(db);
  const createTeacherPayrollRule = new CreateTeacherPayrollRule(
    payrollRuleRepo,
    teacherRepo,
    clock,
    ids,
    plan,
  );
  const closeTeacherPayrollRule = new CloseTeacherPayrollRule(payrollRuleRepo, clock, plan);
  const replaceTeacherPayrollRule = new ReplaceTeacherPayrollRule(
    payrollRuleRepo,
    teacherRepo,
    clock,
    ids,
    plan,
  );
  const listTeacherPayrollRulesByTeacher = new ListTeacherPayrollRulesByTeacher(
    payrollRuleRepo,
    teacherRepo,
    plan,
  );

  // The monthly payroll compute job (SOU-74): reuses the invoice/payment/formula/
  // enrollment/group repos already constructed above to assemble each teacher's
  // attribution base (MonthlyFeeAttributionService wraps the SOU-73 policy), then
  // upserts a `draft` TeacherPayout per (teacherId, month) — idempotent like
  // generateMonthlyInvoices, never auto-paid.
  const payoutRepo = new SqliteTeacherPayoutRepository(db);
  const monthlyFeeAttribution = new MonthlyFeeAttributionService(
    invoiceRepo,
    paymentRepo,
    formulaRepo,
    enrollmentRepo,
    groupRepo,
  );
  const computeMonthlyPayrolls = new ComputeMonthlyPayrolls(
    teacherRepo,
    payrollRuleRepo,
    payoutRepo,
    monthlyFeeAttribution,
    clock,
    ids,
    plan,
  );

  // Payroll dashboard (SOU-76): confirmTeacherPayout/confirmMonthlyPayrolls are
  // the single-row and bulk halves of "Mark paid", both writing through the
  // same `payoutRepo` the compute job above populates. listTeacherPayouts and
  // getTeacherAttributionBreakdown are thin `payroll.teacher`-gated wrappers
  // around `payoutRepo.listLiveByCenterMonth` and `monthlyFeeAttribution`
  // respectively — neither the repo method nor the attribution service carries
  // its own plan check, so the dashboard's read channels need these wrappers
  // for the same gate the write channels already have.
  const confirmTeacherPayout = new ConfirmTeacherPayout(payoutRepo, clock, plan);
  const confirmMonthlyPayrolls = new ConfirmMonthlyPayrolls(payoutRepo, clock, plan);
  const listTeacherPayouts = new ListTeacherPayouts(payoutRepo, plan);
  const getTeacherAttributionBreakdown = new GetTeacherAttributionBreakdown(monthlyFeeAttribution, plan);

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
  // Bulk undo of one generator run (SOU-160): every session a run materializes
  // shares the generationBatchId GenerateSessions mints, so this reuses the same
  // concrete session repository — no new adapter needed.
  const undoGenerationBatch = new UndoGenerationBatch(concreteSessionRepo, clock, plan);

  // Per-session roll-call (SOU-58). The roster itself comes from the existing
  // group-roster IPC (SOU-126/127) — this use case only records the outcome
  // against the concrete session and the SOU-57 attendance store.
  const attendanceRepo = new SqliteAttendanceRepository(db);
  const recordSessionAttendance = new RecordSessionAttendance(
    attendanceRepo,
    concreteSessionRepo,
    clock,
    ids,
    plan,
  );

  const centerRepo = new SqliteCenterRepository(db);
  // Refresh the display-only `center.plan` mirror from the license-resolved plan
  // (SOU-98). No-op until the profile exists; the gate never reads this column.
  centerRepo.writePlanMirror(activePlanId);
  const getCenterProfile = new GetCenterProfile(centerRepo);
  const saveCenterProfile = new SaveCenterProfile(centerRepo, clock, ids);
  const logoStore = new FsLogoStore(options.dir, ids);
  const storeCenterLogo = new StoreCenterLogo(logoStore);
  const readCenterLogo = new ReadCenterLogo(logoStore);

  // Payslip PDF (SOU-75): renders a confirmed TeacherPayout, reusing the
  // invoice PDF adapter's font/layout setup. Resolves the teacher + center
  // profile itself rather than through an IPC-level assembly step like
  // invoice's, since there is no existing gated read for a single payout yet.
  const payslipPdfRenderer = new PdfLibPayslipRenderer();
  const generatePayslipPdf = new GeneratePayslipPdf(
    payoutRepo,
    teacherRepo,
    getCenterProfile,
    readCenterLogo,
    payslipPdfRenderer,
    plan,
  );

  // Payment receipt PDF (SOU-101): renders a single ledger row (payment or
  // reversal), reusing the invoice/payslip PDF adapters' font/layout setup.
  const paymentReceiptPdfRenderer = new PdfLibPaymentReceiptRenderer();
  const generatePaymentReceiptPdf = new GeneratePaymentReceiptPdf(
    paymentRepo,
    invoiceRepo,
    getStudent,
    getCenterProfile,
    readCenterLogo,
    paymentReceiptPdfRenderer,
    plan,
  );

  // Dashboard reads (SOU-100): both use cases only read repositories already
  // constructed above — no new repository, no new adapter. `getDashboardAdvancedSummary`
  // reuses the same `monthlyFeeAttribution` service SOU-74's payroll compute job wired,
  // so the per-subject breakdown and per-teacher payroll can never disagree on one
  // month's collected money.
  const getDashboardBasicSummary = new GetDashboardBasicSummary(
    concreteSessionRepo,
    studentRepo,
    invoiceRepo,
    clock,
    plan,
  );
  const getDashboardAdvancedSummary = new GetDashboardAdvancedSummary(
    invoiceRepo,
    subscriptionRepo,
    attendanceRepo,
    subjectRepo,
    monthlyFeeAttribution,
    clock,
    plan,
  );

  // Attendance reporting reads (SOU-108) — per-student history + absence summary
  // and printable per-group attendance sheet, both read-model reads over the
  // existing attendanceRepo (no new repository, no new adapter). Gated by
  // `core.attendance` (base tier) in the use case; IPC handler passes the throw
  // through the shared error mapping.
  const getStudentAttendanceReport = new GetStudentAttendanceReport(attendanceRepo, plan);
  const getGroupAttendanceSheet = new GetGroupAttendanceSheet(attendanceRepo, plan);

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

  // Auto-session-generator seam (SOU-161): the SOU-158 pure engine, wired for
  // the SOU-159 config-popup preview and its bulk commit. `previewGeneratedSchedule`
  // is a read-only dry run — it resolves `config.scope` against the same
  // `groupRepo`/`roomRepo`/`centerHoursRepo` other calendar use cases already use
  // and reads the real schedule off `sessionRepo` for the SOU-161 conflict pass,
  // but persists nothing. `commitGeneratedSchedule` reuses `createWeeklySession`
  // and `generateSessions` (defined above) verbatim per confirmed block, so a
  // committed slot gets the exact same envelope, plan gate, and conflict
  // re-check as one booked by hand.
  const commitGeneratedSchedule = new CommitGeneratedSchedule(
    groupRepo,
    createWeeklySession,
    generateSessions,
    plan,
  );
  const previewGeneratedSchedule = new PreviewGeneratedSchedule(
    groupRepo,
    roomRepo,
    centerHoursRepo,
    sessionRepo,
    new SessionGenerator(new NodeRandomPort()),
    plan,
  );

  const hasher = new Argon2PasswordHasher();
  const adminRepo = new SqliteAdminAccountRepository(db);
  const createAdminAccount = new CreateAdminAccount(adminRepo, hasher, clock, ids);
  const verifyAdminPassword = new VerifyAdminPassword(adminRepo, hasher);
  const changeAdminPassword = new ChangeAdminPassword(adminRepo, hasher, clock);

  const random = new NodeSecureRandom();
  const recoveryCodeRepo = new SqliteRecoveryCodeRepository(db);
  const auditLogRepo = new SqliteAuthAuditLogRepository(db);
  const generateRecoveryCodes = new GenerateRecoveryCodes(
    recoveryCodeRepo,
    auditLogRepo,
    hasher,
    random,
    clock,
    ids,
  );
  const verifyRecoveryCode = new VerifyRecoveryCode(
    recoveryCodeRepo,
    auditLogRepo,
    hasher,
    new SqliteLoginThrottleStore(db),
    new LoginThrottlePolicy(),
    clock,
    ids,
  );
  const deviceSessions = new DeviceSessionService(new SqliteDeviceSessionStore(db), clock, ids);
  const resetPasswordWithRecoveryCode = new ResetPasswordWithRecoveryCode(
    verifyRecoveryCode,
    adminRepo,
    recoveryCodeRepo,
    auditLogRepo,
    hasher,
    deviceSessions,
    clock,
    ids,
  );

  const securityQuestionRepo = new SqliteSecurityQuestionRepository(db, clock);
  const setSecurityQuestions = new SetSecurityQuestions(
    securityQuestionRepo,
    auditLogRepo,
    hasher,
    clock,
    ids,
  );
  const verifySecurityAnswers = new VerifySecurityAnswers(
    securityQuestionRepo,
    new SqliteSecurityQuestionThrottleStore(db),
    new SecurityQuestionThrottlePolicy(),
    auditLogRepo,
    hasher,
    clock,
    ids,
  );
  const requestPasswordResetViaSecurityQuestions = new RequestPasswordResetViaSecurityQuestions(
    verifySecurityAnswers,
    auditLogRepo,
    clock,
    ids,
  );

  // Locale preference (SOU-31): a plain userData-file adapter, not a domain
  // port — see LocalePreferenceStore's doc for why. `options.dir` is the same
  // userData directory the center DB files and the logo store live under.
  const localePreferences = new LocalePreferenceStore(options.dir);

  // Embedded LAN hub (SOU-90). When enabled, the hub host's own replica syncs
  // to itself over localhost through the SAME SyncHubPort client as every other
  // device — this container never special-cases the hub machine. The listener
  // binds the configured port (fire-and-forget, like the scheduled backup): a
  // failed bind (port in use) is logged, never fatal, and the sync page (SOU-81)
  // surfaces hub health. Real hub designation/setup UX is a later ticket; the
  // option is wired here so the seam exists before its consumer.
  let hubServerInstance: HubServer | null = null;
  let hubStore: SqliteHubStore | null = null;
  let syncHub: SyncHubPort | null = null;
  const hubConfig = options.hubServer;
  if (hubConfig) {
    hubStore = SqliteHubStore.open({ centreId: options.centreId, key: options.key, dir: options.dir }, clock);
    applyMigrations(hubStore.db, toMigrations(hubMigrationFiles));
    hubStore.registerCenter(options.centerCode, hubConfig.token, clock.now());
    hubServerInstance = new HubServer(hubStore, hubConfig.port, hubConfig.bindHost);
    void hubServerInstance.start().catch((error: unknown) => {
      console.error('[hub] failed to start on port', hubConfig.port, error);
    });
    syncHub = new HttpSyncHubClient({
      baseUrl: `http://127.0.0.1:${hubConfig.port}`,
      token: hubConfig.token,
    });
  }

  const attemptLogin = new AttemptLogin(
    verifyAdminPassword,
    new SqliteLoginThrottleStore(db),
    new LoginThrottlePolicy(),
    deviceSessions,
    clock,
  );

  const context: EnvelopeContext = {
    centerCode: options.centerCode,
    deviceOrigin,
    updatedBy: DEV_USER,
  };
  const centerContext: CenterContext = { ...context, seedPlan: activePlanId };

  // Excel backup engine (SOU-44) — data-level export/import, complementing the
  // byte-level snapshot above. `SqliteBackupStore` is tenant-scoped to the open
  // center DB; `ExcelBackupAdapter` is a pure file translator. ApplyImportBackup
  // mints fresh ULIDs + envelopes for id-less people rows from the device context.
  // The store shares the SOU-79 `changeLog` writer so every restored row is
  // appended to the change log inside the apply transaction (a restore is an
  // edit the sync feed must see).
  const backupStore = new SqliteBackupStore(db, options.centerCode, changeLog);
  const backupExcelAdapter = new ExcelBackupAdapter();
  // Dialog-issued path tokens (SOU-44 M3): the backup channels never accept a
  // renderer-supplied path — only paths the user picked in a native dialog,
  // resolved here from the token the dialog handlers issued.
  const dialogPaths = new DialogPathRegistry();
  const exportBackup = new ExportBackup(backupStore, backupExcelAdapter, plan);
  const previewImportBackup = new PreviewImportBackup(backupStore, backupExcelAdapter, plan);
  const applyImportBackup = new ApplyImportBackup(
    backupStore,
    backupExcelAdapter,
    plan,
    clock,
    ids,
    context.deviceOrigin,
    context.updatedBy,
  );

  const handlerDeps: HandlerDeps = {
    appVersion: options.appVersion,
    activePlanId: () => plan.activePlanId(),
    setActivePlan: (planId) => plan.setActivePlan(PLANS[planId]),
    getLicenseStatus,
    activateLicense,
    dialogPaths,
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
    setStudentGuardians,
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
    replaceStudentSubscription,
    listStudentSubscriptions,
    recordPayment,
    voidPayment,
    getInvoicePaymentSummary,
    generateMonthlyInvoices,
    listInvoices,
    listOverdueInvoices,
    issueInvoice,
    cancelInvoice,
    invoicePdfRenderer,
    enrollStudent,
    unenrollStudent,
    createTeacher,
    listTeachers,
    searchPeople,
    getTeacher,
    updateTeacher,
    archiveTeacher,
    restoreTeacher,
    createTeacherPayrollRule,
    closeTeacherPayrollRule,
    replaceTeacherPayrollRule,
    listTeacherPayrollRulesByTeacher,
    computeMonthlyPayrolls,
    confirmTeacherPayout,
    confirmMonthlyPayrolls,
    listTeacherPayouts,
    getTeacherAttributionBreakdown,
    currentUserId: () => context.updatedBy,
    generatePayslipPdf,
    generatePaymentReceiptPdf,
    createHoliday,
    listHolidays,
    updateHoliday,
    archiveHoliday,
    restoreHoliday,
    getDashboardBasicSummary,
    getDashboardAdvancedSummary,
    getStudentAttendanceReport,
    getGroupAttendanceSheet,
    listWeekSessions,
    scheduleRenderer,
    generateSessions,
    undoGenerationBatch,
    recordSessionAttendance,
    createWeeklySession,
    updateWeeklySession,
    cancelWeeklySession,
    previewGeneratedSchedule,
    commitGeneratedSchedule,
    saveCenterHours,
    getCenterHours,
    envelopeContext: () => context,
    adminExists: () => adminRepo.exists(),
    adminUsername: async () => {
      const account = await adminRepo.findOnly();
      return account?.username ?? '';
    },
    createAdminAccount,
    changeAdminPassword,
    attemptLogin,
    deviceSessions,
    generateRecoveryCodes,
    verifyRecoveryCode,
    resetPasswordWithRecoveryCode,
    countRemainingRecoveryCodes: () => recoveryCodeRepo.countUnconsumed(),
    setSecurityQuestions,
    verifySecurityAnswers,
    requestPasswordResetViaSecurityQuestions,
    securityQuestionsExist: () => securityQuestionRepo.exists(),
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
    exportBackup,
    previewImportBackup,
    applyImportBackup,
    activeCenterCode: () => options.centerCode,
    centerCode: () => options.centerCode,
    updatedBy: () => context.updatedBy,
    dbKey: () => options.key,
    scheduleRestart: options.scheduleRestart,
  };

  return {
    handlerDeps,
    subscriptionReference,
    syncHub,
    isRestricted,
    readLocalePreference: () => localePreferences.read(),
    // `db.open` guards against a double-close: a successful restore (SOU-102)
    // already closed this handle as part of its file swap, and `will-quit`
    // still calls `dispose()` during the scheduled relaunch. The hub store is
    // closed only AFTER the listener has stopped, so an in-flight request can
    // never hit a half-closed canonical store.
    dispose: () => {
      if (hubServerInstance && hubStore) {
        void hubServerInstance.stop().finally(() => hubStore?.close());
      } else if (hubStore) {
        hubStore.close();
      }
      if (db.open) db.close();
    },
  };
}

/** Convenience: build the container and its IPC handler set together. */
export function buildHandlers(options: ContainerOptions) {
  const container = buildContainer(options);
  return { handlers: createHandlers(container.handlerDeps), dispose: container.dispose };
}
