/// <reference types="vite/client" />
import type { Database as DB } from 'better-sqlite3';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLANS,
  FEATURE_FLAGS,
  PlanPolicy,
  resolveActivePlan,
  ActivateLicense,
  GetLicenseStatus,
  CreateSubject,
  ArchiveSubject,
  ListSubjects,
  GetSubject,
  ListSubjectsWithUsage,
  UpdateSubject,
  CreateNiveau,
  UpdateNiveau,
  ArchiveNiveau,
  ListNiveaux,
  GetNiveau,
  ListNiveauxWithUsage,
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
  GetTeacherRoster,
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
  ListRecentPayments,
  GetDayTakings,
  GetDayCloseReport,
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
  ResetPlanning,
  AuditSessionsOutsideEffectiveHours,
  CancelSession,
  WeeklySessionScheduleValidator,
  CreateWeeklyRecurringSession,
  UpdateWeeklyRecurringSession,
  CancelWeeklyRecurringSession,
  SessionGenerator,
  PreviewGeneratedSchedule,
  CommitGeneratedSchedule,
  GeneratedScheduleSeatFitGuard,
  CreateAdminAccount,
  CreateUser,
  RedeemSetupCode,
  ValidateSetupCode,
  ReissueSetupCode,
  RecoverPasswordWithSetupCode,
  VerifyUserPassword,
  ChangeAdminPassword,
  GenerateRecoveryCodes,
  VerifyRecoveryCode,
  ResetPasswordWithRecoveryCode,
  ResetPasswordAfterEmailVerification,
  SetOwnerEmail,
  SetSecurityQuestions,
  VerifySecurityAnswers,
  RequestPasswordResetViaSecurityQuestions,
  SecurityQuestionThrottlePolicy,
  SaveCenterHours,
  GetCenterHours,
  SaveCenterHoursOverride,
  GetCenterHoursOverrides,
  GetActiveCenterHoursOverride,
  ArchiveCenterHoursOverride,
  SaveTeacherAvailability,
  GetTeacherAvailability,
  SaveTeacherAvailabilityException,
  ArchiveTeacherAvailabilityException,
  FindSessionsOutsideTeacherAvailability,
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
  GenerateStudentMonthInvoice,
  ListInvoices,
  GetParentMonthlyStatement,
  ListOverdueInvoices,
  IssueInvoice,
  CancelInvoice,
  UpdateDraftInvoiceLineAmount,
  SetInvoiceSubjectAllocation,
  MonthlyFeeAttributionService,
  AttributionLineAssembler,
  ComputeMonthlyPayrolls,
  ConfirmTeacherPayout,
  ConfirmMonthlyPayrolls,
  ListTeacherPayouts,
  GetTeacherAttributionBreakdown,
  GetPayrollProjection,
  GeneratePayslipPdf,
  GeneratePaymentReceiptPdf,
  RecordSessionAttendance,
  GetDashboardBasicSummary,
  GetDashboardAdvancedSummary,
  GetMultiCenterStats,
  DashboardBasicMetricsBuilder,
  GetStudentAttendanceReport,
  GetGroupAttendanceSheet,
  SwitchCenter,
  CenterSwitchError,
  CreateCenter,
  JoinCenter,
  CenterProvisioningError,
  CenterJoinError,
} from '@centresoutien/domain';
import type {
  PlanId,
  FeatureFlag,
  Plan,
  CenterCode,
  UserId,
  Clock,
  LicensePort,
  LicenseBindingContext,
  LicenseVerification,
  IdGenerator,
  RoomReferencePort,
  SubjectReferencePort,
  NiveauReferencePort,
  TeacherReferencePort,
  StudentSubscriptionReferencePort,
  SyncHubPort,
  LocalSyncRepository,
  SubjectCodeCollisionStore,
  SessionDedupStore,
  PaymentReversalDedupStore,
  UserCredentialDuplicateStore,
  CenterSwitchPort,
  CenterProvisioningPort,
} from '@centresoutien/domain';
import { Ed25519LicenseAdapter } from '../data/license/ed25519-license-adapter';
import { E2eSyntheticLicense, isPlanId } from '../data/license/e2e-synthetic-license';
import { FsLicenseStore } from '../data/license/fs-license-store';
import { FileMachineIdentity } from '../data/license/file-machine-identity';
import { legacyLicenseFileNameForCenter, licenseFileName } from '../data/license/license-file-path';
import { VENDOR_LICENSE_PUBLIC_KEY_PEM } from '../data/license/vendor-public-key';
import { SyncEngine, DuplicateMatcher, ResolveConflict } from '@centresoutien/domain';
import { SqliteCenterTrialStore } from '../data/license/sqlite-center-trial-store';
import { openDatabase, centreDbFileName } from '../data/sqlite/db';
import { LibsodiumRecoveryKeyEscrow } from '../data/crypto/libsodium-recovery-key-escrow';
import { RecoveryKeyEscrowWriter } from './recovery-key-escrow-writer';
import { recoveryPublicKey } from './recovery-public-key';
import type { CenterSummary, CenterKeyProvider } from '../data/sqlite/center-directory';
import type { SyncProgressEvent } from '../shared/ipc/sync-events';
import { SqliteMultiCenterStatsRead } from '../data/sqlite/multi-center-stats-read';
import { applyMigrations, toMigrations } from '../data/sqlite/migration-runner';
import { readOrCreateDeviceOrigin } from '../data/sqlite/device-origin';
import { SqliteCenterProvisioning } from '../data/sqlite/center-provisioning';
import { SqliteCenterJoinProvisioning } from '../data/sqlite/center-join-provisioning';
import { SqliteHubStore } from '../data/sqlite/hub/hub-store';
import { HubServer } from './hub-server/hub-server';
import { HttpSyncHubClient } from '../data/sync/http-sync-hub-client';
import { HubHostingService, type HubHostingConfigAccess } from './hub-discovery/hub-hosting';
import type { HubAdvertisement, HubAdvertiserPort, HubDiscovererPort } from './hub-discovery/hub-service';
import { ChangeLogOutbox } from '../data/sqlite/change-log/change-log-outbox';
import { SqliteSubjectRepository } from '../data/sqlite/repositories/subject-repository';
import { SqliteNiveauRepository } from '../data/sqlite/repositories/niveau-repository';
import { SqliteNiveauReference } from '../data/sqlite/repositories/niveau-reference';
import { SqliteChangeLogWriter } from '../data/sqlite/change-log/sqlite-change-log-writer';
import { backfillCenterIdentityChangeLog } from '../data/sqlite/center-identity-backfill';
import { SqliteLocalSyncRepository } from '../data/sqlite/change-log/sqlite-sync-local-repository';
import { SqliteDuplicateMatchSource } from '../data/sqlite/change-log/sqlite-duplicate-match-source';
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
import { SqliteDayCloseActivityRepository } from '../data/sqlite/repositories/day-close-activity-repository';
import { SqlitePaymentLedgerUnitOfWork } from '../data/sqlite/repositories/payment-ledger-unit-of-work';
import {
  ensurePaymentReversalUniqueIndex,
  PAYMENT_DOUBLE_VOID_MESSAGE,
} from '../data/sqlite/repairs/payment-reversal-index';
import { SqliteTeacherRepository } from '../data/sqlite/repositories/teacher-repository';
import { SqliteTeacherPayrollRuleRepository } from '../data/sqlite/repositories/teacher-payroll-rule-repository';
import { SqliteTeacherPayoutRepository } from '../data/sqlite/repositories/teacher-payout-repository';
import { SqliteHolidayRepository } from '../data/sqlite/repositories/holiday-repository';
import { SqliteWeeklyRecurringSessionRepository } from '../data/sqlite/repositories/weekly-recurring-session-repository';
import { SqliteSessionRepository } from '../data/sqlite/repositories/session-repository';
import { SqliteAttendanceRepository } from '../data/sqlite/repositories/attendance-repository';
import { SqliteCenterHoursRepository } from '../data/sqlite/repositories/center-hours-repository';
import { SqliteCenterHoursOverrideRepository } from '../data/sqlite/repositories/center-hours-override-repository';
import { SqliteTeacherAvailabilityRepository } from '../data/sqlite/repositories/teacher-availability-repository';
import { SqliteTeacherAvailabilityExceptionRepository } from '../data/sqlite/repositories/teacher-availability-exception-repository';
import { SqliteAdminAccountRepository } from '../data/sqlite/repositories/admin-account-repository';
import { SqliteUserRepository } from '../data/sqlite/repositories/user-repository';
import { SqliteRecoveryCodeRepository } from '../data/sqlite/repositories/recovery-code-repository';
import { SqliteRecoveryCodeResetUnitOfWork } from '../data/sqlite/repositories/recovery-code-reset-unit-of-work';
import { SqliteEmailPasswordResetUnitOfWork } from '../data/sqlite/repositories/email-password-reset-unit-of-work';
import { SqliteSetupCodeRecoveryUnitOfWork } from '../data/sqlite/repositories/setup-code-recovery-unit-of-work';
import { HttpEmailResetRelay } from '../data/relay/http-email-reset-relay';
import { SqliteResetPlanningUnitOfWork } from '../data/sqlite/repositories/reset-planning-unit-of-work';
import { SqliteSecurityQuestionRepository } from '../data/sqlite/repositories/security-question-repository';
import { SqliteAuthAuditLogRepository } from '../data/sqlite/repositories/auth-audit-log-repository';
import { SqliteLoginThrottleStore } from '../data/sqlite/repositories/login-throttle-store';
import { SqliteSecurityQuestionThrottleStore } from '../data/sqlite/repositories/security-question-throttle-store';
import { SqliteDeviceSessionStore } from '../data/sqlite/repositories/device-session-store';
import { SqliteCenterRepository } from '../data/sqlite/repositories/center-repository';
import { SqliteCenterSetupUnitOfWork } from '../data/sqlite/repositories/center-setup-unit-of-work';
import { FsLogoStore } from '../data/fs/logo-store';
import { SqliteBackupAdapter } from '../data/sqlite/repositories/backup-adapter';
import { SqliteBackupConfigStore } from '../data/sqlite/repositories/backup-config-store';
import { SqliteBackupStore } from '../data/sqlite/repositories/backup-store';
import { ExcelBackupAdapter } from '../data/excel/backup-excel-adapter';
import { DialogPathRegistry } from './ipc/dialog-path-registry';
import { PdfLibInvoiceRenderer } from '../data/pdf/pdf-lib-invoice-renderer';
import { PdfLibDayCloseReportRenderer } from '../data/pdf/pdf-lib-day-close-report-renderer';
import { PdfLibParentStatementRenderer } from '../data/pdf/pdf-lib-parent-statement-renderer';
import { PdfLibMultiCenterStatsRenderer } from '../data/pdf/pdf-lib-multi-center-stats-renderer';
import { PdfLibTeacherRosterRenderer } from '../data/pdf/pdf-lib-teacher-roster-renderer';
import { PdfLibPayslipRenderer } from '../data/pdf/pdf-lib-payslip-renderer';
import { PdfLibPaymentReceiptRenderer } from '../data/pdf/pdf-lib-payment-receipt-renderer';
import { PdfLibScheduleRenderer } from '../data/pdf/pdf-lib-schedule-renderer';
import { wireSessionPrincipal } from './session/session-principal-wiring';
import { SystemClock } from './infra/system-clock';
import { UlidIdGenerator } from './infra/ulid-id-generator';
import { HashWasmPasswordHasher } from './infra/hash-wasm-password-hasher';
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

// Bootstrap/first-run attribution fallback (SOU-265): used only when NO principal is established (pre-login / first-run owner+center creation).
const DEV_USER = 'usr_local-device' as UserId;

export type ContainerOptions = {
  centreId: string; // database-file discriminator
  centerCode: CenterCode; // tenant code stamped on entities
  key: string; // SQLCipher passphrase — the per-center derived key (SOU-179)
  dir: string; // directory holding the center DB files
  tempDir: string; // Electron-resolved temp dir for *.print PDF artifacts (SOU-163)
  planId: PlanId;
  appVersion: () => string;
  /** Backup restore (SOU-102) swaps the live DB file and closes its handle —
   *  the app must relaunch to reopen it. Kept out of composition-root/handlers
   *  so they stay Electron-free, mirroring `appVersion`. */
  scheduleRestart: () => void;
  /** Push a live sync-progress tick to the renderer (SOU-330). Electron-free —
   *  `index.ts` wires it to `webContents.send`; absent in headless/test wirings,
   *  where it defaults to a no-op. */
  emitSyncProgress?: (event: SyncProgressEvent) => void;
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
  /**
   * Client-only hub (SOU-82): point this device's {@link SyncHubPort} at an
   * EXTERNAL bare hub — another laptop, or the multi-laptop E2E's standalone
   * `HubServer` process — without serving one here. Mutually exclusive with
   * `hubServer`: a hub host already wires its own client at its own listener, so
   * `index.ts` only resolves this when it is NOT a hub host. Absent by default;
   * `index.ts` opts in via `CS_SYNC_HUB_URL` / `CS_SYNC_HUB_TOKEN`. No canonical
   * store and no listener are opened on this device — it is a pure replica.
   */
  hubClient?: { baseUrl: string; token: string };
  /** Test seams for deterministic domain and integration testing. */
  clock?: Clock;
  ids?: IdGenerator;
  /**
   * Center switcher (SOU-96). The app shell owns the fs directory scan and the
   * live hot-swap machinery (both need Electron + the userData dir), so it passes
   * them in as closures — the composition root only wires them into the
   * `SwitchCenter` use case (which enforces the `org.multi-center` gate) and the
   * `center.list` handler. Absent → single-center fallbacks: `center.list`
   * reports only the open center and `center.switch` rejects with
   * `CenterSwitchError` (after the plan gate), so no channel is left unwired.
   */
  centerSwitch?: {
    switchTo: (centreId: string) => Promise<void>;
    listCenters: () => Promise<readonly CenterSummary[]>;
  };
  /**
   * Per-center stats aggregation (SOU-106, Premium `org.multi-center`). The app
   * shell owns the per-center key derivation + the demo-center exclusion (both need
   * the keychain and the userData dir), so it passes them in as it does for
   * `centerSwitch`; the composition root wires them into the read-only aggregation
   * adapter. Absent → the adapter falls back to `options.key`, so it can only read
   * the currently-open center's own file (other centers, encrypted under different
   * keys, degrade to `unavailable` rows) — the correct single-center behavior for
   * integration tests and installs with no shell wiring.
   */
  multiCenterStats?: {
    keyFor: CenterKeyProvider;
    excludeCentreIds: readonly string[];
  };
  /**
   * Add-a-center provisioning (SOU-310, Premium `org.multi-center`). The app shell
   * owns the per-center key derivation (the keychain lives in main), so it passes
   * the same `keyFor` it uses for the switcher/stats; the composition root wires it
   * into the `CenterProvisioning` adapter behind `CreateCenter`. Absent → the
   * `center.create` use case rejects with `CenterProvisioningError` (after the plan
   * gate), so the channel stays wired for integration tests without a shell.
   */
  provisioning?: {
    keyFor: CenterKeyProvider;
  };
  /** Join-an-existing-center provisioning (SOU-318). Provided by `index.ts`: the
   *  per-center key derivation and the hub-client config writer the cold-bootstrap
   *  persists on success. Absent → `hub.joinCenter` rejects with `CenterJoinError`
   *  (after the plan gate). */
  joining?: {
    keyFor: CenterKeyProvider;
    clientConfig: {
      write(centreId: string, config: { baseUrl: string; token: string }): void;
      clear(centreId: string): void;
    };
  };
  /** LAN hub hosting + discovery (SOU-318). Provided by `index.ts`, which owns the
   *  persisted config store (bound here to THIS center's id) and the single
   *  Bonjour instance shared as advertiser + discoverer. Absent in tests and in
   *  wirings that do not support hosting. */
  hubHosting?: {
    config: HubHostingConfigAccess;
    resolveBindHost: () => string | null;
    randomBytes: (size: number) => Uint8Array;
    /** Absent when the mDNS socket could not be opened (sandboxed / CI) — hosting
     *  config still works, the LAN just gets no advertisement / discovery. */
    advertiser?: HubAdvertiserPort;
    discoverer?: HubDiscovererPort;
  };
};

export type Container = {
  handlerDeps: HandlerDeps;
  /** The open center's SQLCipher handle, exposed to main-owned lifecycle code. */
  db: DB;
  /**
   * The real {@link StudentSubscriptionReferencePort} adapter (SOU-63), published so
   * SOU-126 can inject it into `EnrollStudent` when it wires the enrollment
   * persistence + IPC. Nothing consumes it yet on this branch.
   */
  subscriptionReference: StudentSubscriptionReferencePort;
  /**
   * The embedded hub's {@link SyncHubPort} client (SOU-90) for the open center —
   * the seam the sync engine (SOU-81) will drive. An HTTP client pointed at the
   * hub's own listening interface (`bindHost`, the LAN address the server binds),
   * so the hub laptop reaches its own server through the same port as every peer
   * and is never special-cased. Null when the hub is disabled.
   */
  syncHub: SyncHubPort | null;
  /** Read once, synchronously, before the window opens — see `LocalePreferenceStore`. */
  readLocalePreference: () => LocalePreference | null;
  /**
   * The live restricted-mode gate (SOU-104): `true` while the license is non-active,
   * so the IPC dispatcher answers only `license.status` / `license.activate`. Fed
   * to the dispatcher by `MainRuntime`; re-evaluated per call, never a startup
   * snapshot. This is the
   * server-side hard lock that supersedes the deferred SOU-173.
   */
  isRestricted: () => boolean;
  /**
   * The trusted first-run state (SOU-104): `true` once an admin account exists —
   * the durable marker that setup finished. Fed to the dispatcher by `MainRuntime` so the
   * restricted-mode gate closes the wizard's bootstrap channels on an already
   * configured center whose license later lapses, while still allowing them on a
   * fresh install where the wizard has yet to create the center + admin.
   */
  isSetupComplete: () => boolean;
  dispose: () => void;
};

/**
 * A cheap fingerprint of the license file, changing whenever activation rewrites
 * it (atomic temp+rename bumps mtime; a different license changes the size too).
 * `null` when the file is absent — a fresh install before any activation. Lets the
 * restricted-mode gate skip the Ed25519 read+verify on the synchronous IPC path
 * (SOU-104 perf) and re-verify only when the file actually changed; a `stat` is
 * orders of magnitude cheaper than a signature check on every dispatch.
 *
 * With SOU-315 the adapter may read the legacy per-center file when the
 * machine-scoped primary is absent, so the fingerprint must reflect whichever
 * file is actually in effect: the primary when present, otherwise the legacy file
 * (`legacy:`-prefixed so the two states never collide). This keeps deletion or
 * replacement of the legacy file from leaving a stale license effective.
 */
function licenseFileFingerprint(filePath: string, legacyFilePath?: string): string | null {
  try {
    const stat = statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    if (legacyFilePath === undefined) return null;
    try {
      const stat = statSync(legacyFilePath);
      return `legacy:${stat.mtimeMs}:${stat.size}`;
    } catch {
      return null;
    }
  }
}

/**
 * Whether the center's owner has been created — the durable marker that the
 * first-run wizard finished (see `restricted-mode.ts`). A trivial indexed probe;
 * mirrors `SqliteAdminAccountRepository.exists`, read synchronously here because
 * the restricted-mode dispatch gate is synchronous. Reads `users` (SOU-252): the
 * owner is a `users` row, whether freshly created there or backfilled from the
 * legacy `admin_accounts` table by migration 0044.
 */
function adminAccountExists(db: DB): boolean {
  return (
    db.prepare("SELECT 1 FROM users WHERE role = 'owner' AND deleted_at IS NULL LIMIT 1").get() !==
    undefined
  );
}

/** Read the device's stable origin id, generating and persisting it on first run. */
const resolveDeviceOrigin = readOrCreateDeviceOrigin;

/**
 * The active plan, resolved once at startup from the tamper-evident license file
 * (SOU-98/SOU-104). A verified, unexpired, correctly-bound license yields its
 * tier; every other state (missing / bad-signature / expired / wrong-machine /
 * wrong-center) is a HARD LOCK: the renderer, driven by the `license.status` IPC
 * (`restricted`), confines the whole app to the
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

function activeFeatureSet(planId: PlanId): Set<FeatureFlag> {
  return new Set(PLANS[planId].features);
}

function isFeatureFlag(value: string): value is FeatureFlag {
  return FEATURE_FLAGS.includes(value as FeatureFlag);
}

function parseE2eOmittedFeatures(raw: string | undefined, planId: PlanId): readonly FeatureFlag[] {
  if (!raw) return [];
  const activeFeatures = activeFeatureSet(planId);
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      if (!isFeatureFlag(value) || !activeFeatures.has(value)) {
        throw new Error(`CS_E2E_OMIT_FEATURES contains unknown or inactive feature: ${value}`);
      }
      return value;
    });
}

function resolvePlanForPolicy(planId: PlanId): Plan {
  const base = PLANS[planId];
  const omitted = __CS_E2E__ ? parseE2eOmittedFeatures(process.env['CS_E2E_OMIT_FEATURES'], planId) : [];
  if (omitted.length === 0) return base;
  const omittedSet = new Set(omitted);
  return {
    ...base,
    features: new Set([...base.features].filter((feature) => !omittedSet.has(feature))),
  };
}

/**
 * The one place concrete adapters are constructed and injected into use cases.
 * Opens the center database, migrates it, wires the SQLite repositories to the
 * domain use cases, and exposes them as IPC handler dependencies.
 */
export function buildContainer(options: ContainerOptions): Container {
  const db = openDatabase({ centreId: options.centreId, key: options.key, dir: options.dir });
  applyMigrations(db, toMigrations(migrationFiles));
  // Data-conditional backstop the pure-.sql migration can't express (SOU-233): add the
  // unique reversal index only when the ledger is clean, never bricking DB-open on a
  // legacy double-void. A pending double-void is surfaced bilingually, never as a raw
  // SqliteError — correctness holds regardless via the in-tx guard + deduped net.
  const reversalIndex = ensurePaymentReversalUniqueIndex(db);
  if (!reversalIndex.uniqueIndexActive && reversalIndex.pendingDoubleVoids.length > 0) {
    console.warn(PAYMENT_DOUBLE_VOID_MESSAGE.fr, { pendingDoubleVoids: reversalIndex.pendingDoubleVoids });
  }

  const clock = options.clock ?? new SystemClock();
  const ids = options.ids ?? new UlidIdGenerator();
  // Trust anchor + license path are fixed in a packaged build so a user cannot
  // point them at a self-signed keypair to self-upgrade (SOU-98). The path is
  // machine-scoped (SOU-315, CLAUDE.md §5ter) — one license per laptop, shared by
  // every center, so a Premium license entitles every center the director
  // provisions. Center binding is enforced by the license's `centerCode` claim,
  // not by the file name. The legacy per-center file (SOU-104 M2) is still read
  // as a fallback when the machine-scoped file is absent. The read (adapter) and
  // write (store) paths share the machine-scoped value, so they always agree. The
  // `CS_LICENSE_*` env overrides are gated behind `__CS_E2E__` (SOU-172) — a
  // build-time constant electron-vite sets `true` ONLY for the dedicated
  // `--mode e2e` build and `false` for every dev and release build. In a release
  // build the whole override branch (env reads + test key path) is
  // dead-code-eliminated, so the shipped binary always trusts the vendor key at
  // the fixed machine-scoped path and a determined user cannot swap the trust
  // anchor — the honest-user security baseline (CLAUDE.md §5quater) holds. The
  // e2e build injects a committed TEST public key so signature-valid fixtures can
  // activate; unit + integration tests inject through `options.license` instead.
  const licenseFilePath =
    __CS_E2E__ && process.env['CS_LICENSE_FILE']
      ? process.env['CS_LICENSE_FILE']
      : join(options.dir, licenseFileName());
  const legacyLicenseFilePath = join(
    options.dir,
    legacyLicenseFileNameForCenter(options.centerCode),
  );
  // E2E-only (SOU-172): the dedicated `--mode e2e` build boots ACTIVE on the tier
  // a spec asks for (`CS_PLAN`) whenever `CS_E2E_LICENSE_PLAN` is present — the
  // Playwright global-setup sets it for every NON-license spec, so the whole
  // feature suite runs unlocked exactly as it did before the SOU-104 hard lock.
  // `license-activation.spec` strips this env, so it still exercises the real
  // file-based lock via the Ed25519 adapter below. Release builds set `__CS_E2E__`
  // false, dead-code-eliminating this branch and the synthetic adapter entirely.
  const e2eUnlockPlan = __CS_E2E__ ? process.env['CS_E2E_LICENSE_PLAN'] : undefined;
  const licensePublicKey = __CS_E2E__
    ? (process.env['CS_LICENSE_PUBLIC_KEY'] ?? VENDOR_LICENSE_PUBLIC_KEY_PEM)
    : VENDOR_LICENSE_PUBLIC_KEY_PEM;
  const license =
    options.license ??
    (e2eUnlockPlan !== undefined
      ? new E2eSyntheticLicense(
          isPlanId(process.env['CS_PLAN'])
            ? process.env['CS_PLAN']
            : isPlanId(e2eUnlockPlan)
              ? e2eUnlockPlan
              : 'premium',
        )
      : new Ed25519LicenseAdapter({
          filePath: licenseFilePath,
          legacyFilePath: legacyLicenseFilePath,
          publicKey: licensePublicKey,
        }));
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
  const plan = new PlanPolicy(resolvePlanForPolicy(activePlanId));

  // The server-side restricted-mode hard lock (SOU-104), superseding the deferred
  // SOU-173. Until the license resolves to `active`, the IPC dispatcher answers
  // only `license.status` / `license.activate` — every other channel is rejected
  // with `LicenseRestrictedError`, so the lock no longer lives only in the renderer.
  // Evaluated LIVE on each guarded call, so a successful `license.activate` — which
  // rewrites the license file and flips the plan — unblocks the other channels in
  // the same process with no restart. The expensive half (file read + Ed25519
  // verify) is cached and re-run only when the file's fingerprint changes; the
  // cheap, clock-dependent half (expiry) is recomputed every call, so a license
  // that lapses mid-session still restricts without a rewrite. A dev build with no
  // injected license keeps the `CS_LICENSE_*` / `options.planId` override ergonomics
  // (never restricted); tests inject `options.license`, exercising the real lock.
  const devOverrideActive = import.meta.env.DEV && options.license === undefined;
  let cachedFingerprint: string | null = licenseFileFingerprint(licenseFilePath, legacyLicenseFilePath);
  let cachedVerification = license.verify();
  const verifyLicenseCached = (): LicenseVerification => {
    const fingerprint = licenseFileFingerprint(licenseFilePath, legacyLicenseFilePath);
    if (fingerprint !== cachedFingerprint) {
      cachedFingerprint = fingerprint;
      cachedVerification = license.verify();
    }
    return cachedVerification;
  };

  // The trusted first-run state for the restricted-mode gate: an admin account is
  // the wizard's last durable artifact (its step progress is otherwise ephemeral),
  // so its existence means setup is complete and the wizard's bootstrap channels
  // must close under restriction. Monotonic (false→true once; no hard delete), so
  // it is memoized to true forever and never re-queries after — no per-call DB hit
  // on the steady-state path.
  let setupComplete = adminAccountExists(db);
  const isSetupComplete = (): boolean => {
    if (!setupComplete) setupComplete = adminAccountExists(db);
    return setupComplete;
  };

  // License activation (SOU-104): the activation screen's two channels. `activate`
  // verifies a pasted/imported envelope, checks it binds to this machine + center
  // and hasn't expired, then persists it and flips the live plan; `status` reports
  // the installed license's resolved state for the screen + Settings. The store
  // writes to the same fixed `licenseFilePath` the startup adapter reads.
  const licenseStore = new FsLicenseStore(licenseFilePath);
  const trialStore = new SqliteCenterTrialStore(db);
  const activateLicense = new ActivateLicense(
    license,
    licenseStore,
    machineIdentity,
    clock,
    plan,
    options.centerCode,
    resolvePlanForPolicy,
  );
  const getLicenseStatus = new GetLicenseStatus(
    { verify: verifyLicenseCached, verifyContent: (raw) => license.verifyContent(raw) },
    machineIdentity,
    clock,
    options.centerCode,
    trialStore,
  );
  const isRestricted = (): boolean =>
    devOverrideActive ? false : getLicenseStatus.isRestricted();

  // The acting laptop, resolved once — stamped on every change_log row (SOU-79)
  // and carried in the envelope context below.
  const deviceOrigin = resolveDeviceOrigin(db, ids);
  const changeLog = new SqliteChangeLogWriter(db, clock, deviceOrigin);

  // Backfill the center's identity into the change log if it predates SOU-318
  // sync-wiring (SOU-318), so an already-running center can still be joined from a
  // second device. Idempotent and guarded to rows THIS device authored, so it is a
  // no-op on fresh centers and on joined replicas — must run before the initial
  // self-push below drains the outbox.
  backfillCenterIdentityChangeLog(db, changeLog, deviceOrigin);

  const subjectRepo = new SqliteSubjectRepository(db, changeLog);
  const createSubject = new CreateSubject(subjectRepo, clock, ids, plan);
  const listSubjects = new ListSubjects(subjectRepo, plan);
  const getSubject = new GetSubject(subjectRepo, plan);
  const listSubjectsWithUsage = new ListSubjectsWithUsage(subjectRepo, plan);
  const updateSubject = new UpdateSubject(subjectRepo, clock, plan);

  const niveauRepo = new SqliteNiveauRepository(db, changeLog);
  const createNiveau = new CreateNiveau(niveauRepo, clock, ids, plan);
  const listNiveaux = new ListNiveaux(niveauRepo, plan);
  const getNiveau = new GetNiveau(niveauRepo, plan);
  const listNiveauxWithUsage = new ListNiveauxWithUsage(niveauRepo, plan);
  const updateNiveau = new UpdateNiveau(niveauRepo, clock, plan);
  // The niveau in-use guard's real backing: a composite over the live
  // student / group / teacher reference queries, wired into `ArchiveNiveau`.
  const niveauReference: NiveauReferencePort = new SqliteNiveauReference(db);
  const archiveNiveau = new ArchiveNiveau(niveauRepo, niveauReference, clock, plan);

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
  const sessionRepo = new SqliteWeeklyRecurringSessionRepository(db, changeLog);
  const roomReference: RoomReferencePort = sessionRepo;
  const listWeekSessions = new ListWeekSessions(sessionRepo, plan);
  // Weekly schedule PDF export (SOU-107): no domain use case sits between
  // `ListWeekSessions` and this renderer — the IPC handler filters the
  // already-fetched week to the requested view itself (`schedule-pdf-assembly.ts`).
  const scheduleRenderer = new PdfLibScheduleRenderer();
  const createRoom = new CreateRoom(roomRepo, clock, ids, plan);
  const listRooms = new ListRooms(roomRepo, plan);
  const archiveRoom = new ArchiveRoom(roomRepo, roomReference, clock, plan);
  const restoreRoom = new RestoreRoom(roomRepo, clock, plan);

  const groupRepo = new SqliteGroupRepository(db);
  const updateRoom = new UpdateRoom(roomRepo, sessionRepo, groupRepo, clock, plan);
  const createGroup = new CreateGroup(groupRepo, subjectRepo, clock, ids, plan);
  const listGroups = new ListGroups(groupRepo, plan);
  const updateGroup = new UpdateGroup(groupRepo, subjectRepo, sessionRepo, roomRepo, clock, plan);
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
  // Invoice persistence + the shared per-student draft generation unit (SOU-289)
  // are constructed before the subscription use case: enrollment generates the
  // student's first invoice through the exact same path (and dedup key) as the
  // monthly batch below.
  const invoiceRepo = new SqliteInvoiceRepository(db);
  const createInvoiceDraft = new CreateInvoiceDraft(invoiceRepo, clock, ids, plan);
  const generateStudentMonthInvoice = new GenerateStudentMonthInvoice(
    invoiceRepo,
    createInvoiceDraft,
    clock,
    ids,
    plan,
  );
  const createStudentSubscription = new CreateStudentSubscription(
    subscriptionRepo,
    studentRepo,
    formulaRepo,
    generateStudentMonthInvoice,
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
    sessionRepo,
    clock,
    ids,
    plan,
  );
  const unenrollStudent = new UnenrollStudent(enrollmentRepo, groupRepo, clock, plan);
  // Group roster + list-counts read models (SOU-127): the roster resolves a group's
  // live enrollments to student names; list-with-counts reuses ListGroups and adds a
  // single batch enrollment count so the list renders fill % without an N+1.
  const getGroupRoster = new GetGroupRoster(enrollmentRepo, studentRepo, plan);
  const listGroupsWithCounts = new ListGroupsWithCounts(listGroups, enrollmentRepo);

  // The append-only payment ledger (SOU-93) — payment use cases read the invoice
  // header + its lines (via `invoiceRepo`, constructed with the subscription block
  // above) to size the balance. RecordPayment appends a `payment` (gating a
  // partial amount on `core.invoicing.partial-paid`); VoidPayment appends a `reversal`
  // (never a delete); GetInvoicePaymentSummary derives the status from the ledger.
  // Both writes go through the transactional ledger unit-of-work (SOU-233 / CS-AUD-002),
  // which re-checks the balance/reversal invariant inside the same transaction as the
  // append so a check-then-insert race cannot overshoot the balance or double-reverse.
  const paymentRepo = new SqlitePaymentRepository(db, changeLog);
  const paymentLedgerUnitOfWork = new SqlitePaymentLedgerUnitOfWork(db, changeLog);
  const recordPayment = new RecordPayment(paymentRepo, invoiceRepo, clock, ids, plan, paymentLedgerUnitOfWork);
  const voidPayment = new VoidPayment(paymentRepo, clock, ids, plan, paymentLedgerUnitOfWork);
  const getInvoicePaymentSummary = new GetInvoicePaymentSummary(paymentRepo, invoiceRepo, plan);
  // The cash-desk feed (SOU-198): the one cross-invoice payment read. Reuses the same
  // SqlitePaymentRepository, which also implements RecentPaymentsReadPort — one adapter,
  // several ports, exactly like SqliteInvoiceRepository carries the Impayés read.
  const listRecentPayments = new ListRecentPayments(paymentRepo, plan);
  // The cash-desk header total (SOU-198): the day-takings aggregate, netted in SQL so it
  // is independent of the recent-feed row cap. Same SqlitePaymentRepository / read port.
  const getDayTakings = new GetDayTakings(paymentRepo, plan);
  // The monthly generation job (SOU-68): delegates every student to the same
  // GenerateStudentMonthInvoice unit as the enrollment hook (SOU-289), so batch
  // re-runs and enrollment-first months converge on one invoice per student-month.
  const generateMonthlyInvoices = new GenerateMonthlyInvoices(
    subscriptionRepo,
    formulaRepo,
    generateStudentMonthInvoice,
    plan,
  );
  // Invoice list/detail/print/export (SOU-69): the read model (SOU-69 domain)
  // reused for both the filterable list screen and single-invoice detail
  // fetches, plus the pdf-lib adapter the print/export IPC handlers assemble
  // into an InvoicePdfInput (student name + center profile + this invoice's
  // own already-derived totals).
  const listInvoices = new ListInvoices(invoiceRepo, plan);
  const invoicePdfRenderer = new PdfLibInvoiceRenderer();
  // End-of-day "Clôture du jour" report (SOU-300): a pure read composing the cash-desk
  // day takings + recent payments with the new activity read (subscriptions/enrollments/
  // invoices by UTC envelope day), plus its own FR-only pdf-lib adapter reusing the
  // SOU-279 invoice primitives. No schema change, no new entity; gated on core.invoicing.
  const dayCloseActivityRepo = new SqliteDayCloseActivityRepository(db);
  const getDayCloseReport = new GetDayCloseReport(paymentRepo, dayCloseActivityRepo, plan);
  const dayCloseReportPdfRenderer = new PdfLibDayCloseReportRenderer();
  // Consolidated per-parent statement — "Facture groupée" (SOU-284): a pure derived
  // read model over each child's per-student invoice (no stored parent invoice),
  // plus its own pdf-lib adapter reusing the SOU-279 invoice primitives. Resolves
  // the guardian + children center-scoped; gated on core.invoicing + core.parents.
  const getParentMonthlyStatement = new GetParentMonthlyStatement(
    parentRepo,
    studentRepo,
    invoiceRepo,
    plan,
  );
  const parentStatementPdfRenderer = new PdfLibParentStatementRenderer();
  const teacherRosterPdfRenderer = new PdfLibTeacherRosterRenderer();
  // Issue / cancel (SOU-143): the two lifecycle transitions shipped unwired
  // alongside CreateInvoiceDraft in SOU-67 (KICKOFF, SOU-69) — thin IPC plumbing
  // only, no new domain logic.
  const issueInvoice = new IssueInvoice(invoiceRepo, clock, plan);
  const cancelInvoice = new CancelInvoice(invoiceRepo, clock, plan);
  // Draft-line amount override (SOU-289): draft-only; issued/cancelled lines stay frozen.
  const updateDraftInvoiceLineAmount = new UpdateDraftInvoiceLineAmount(invoiceRepo, clock, plan);
  // Manual per-invoice attribution override (SOU-298): pins/clears the per-subject
  // weight vector weighted attribution uses; gated by `payroll.teacher`.
  const setInvoiceSubjectAllocation = new SetInvoiceSubjectAllocation(
    invoiceRepo,
    formulaRepo,
    clock,
    plan,
  );
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
  // Teacher student roster (SOU-299): the read model behind the "Élèves" tab —
  // teacher → group(s) → enrolled students, folded to one row per student.
  const getTeacherRoster = new GetTeacherRoster(
    teacherRepo,
    groupRepo,
    enrollmentRepo,
    studentRepo,
    subjectRepo,
    subscriptionRepo,
    clock,
    plan,
  );

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
    new AttributionLineAssembler(invoiceRepo, paymentRepo, formulaRepo, enrollmentRepo, groupRepo),
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
  // In-progress payroll projection (SOU-316): read-only, reuses the same
  // attribution service + rule/teacher repos the compute job does, so the
  // projected figure and the finalized payout share one attribution math.
  const getPayrollProjection = new GetPayrollProjection(
    teacherRepo,
    payrollRuleRepo,
    monthlyFeeAttribution,
    plan,
  );

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
  const concreteSessionRepo = new SqliteSessionRepository(db, changeLog);
  // Ramadan schedule overrides (SOU-165): generation consults the active override
  // for each date, taking precedence over the static weekly hours and skipping
  // dates whose fixed template time no longer fits the override's windows.
  const centerHoursOverrideRepo = new SqliteCenterHoursOverrideRepository(db, changeLog);
  const generateSessions = new GenerateAndPersistSessions(
    concreteSessionRepo,
    sessionRepo,
    holidayRepo,
    centerHoursOverrideRepo,
    new GenerateSessions(clock, ids),
    plan,
  );
  // Bulk undo of one generator run (SOU-160): every session a run materializes
  // shares the generationBatchId GenerateSessions mints, so this reuses the same
  // concrete session repository — no new adapter needed.
  const undoGenerationBatch = new UndoGenerationBatch(concreteSessionRepo, clock, plan);

  // Director-facing danger-zone bulk clear (SOU-295): soft-deletes every future
  // concrete session AND every recurring template of the center in ONE
  // transaction via SqliteResetPlanningUnitOfWork, so future regeneration cannot
  // re-materialise the wiped planning. Past/attended sessions are untouched (the
  // use case reads only `date >= cutoffDate`). Gated by `core.calendar.week`.
  const resetPlanning = new ResetPlanning(
    concreteSessionRepo,
    sessionRepo,
    clock,
    plan,
    new SqliteResetPlanningUnitOfWork(db, changeLog),
  );

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

  const centerRepo = new SqliteCenterRepository(db, changeLog);
  // Refresh the display-only `center.plan` mirror from the license-resolved plan
  // (SOU-98). No-op until the profile exists; the gate never reads this column.
  centerRepo.writePlanMirror(activePlanId);
  const getCenterProfile = new GetCenterProfile(centerRepo);
  // Persisting default hours at center creation (SOU-235) lets a fresh center
  // schedule sessions before the admin opens Settings. Seeding runs domain-side
  // here — never via a renderer IPC round-trip, which restricted mode blocks on
  // an unlicensed first run.
  const centerHoursRepo = new SqliteCenterHoursRepository(db);
  const centerSetup = new SqliteCenterSetupUnitOfWork(db, changeLog);
  const saveCenterProfile = new SaveCenterProfile(
    centerRepo,
    clock,
    ids,
    centerSetup,
    {
      hasActiveLicense: () =>
        resolveActivePlan(verifyLicenseCached(), clock.now(), licenseBinding).status === 'active',
    },
  );
  const logoStore = new FsLogoStore(options.dir, ids);
  const storeCenterLogo = new StoreCenterLogo(logoStore);
  const readCenterLogo = new ReadCenterLogo(logoStore);

  // Center switcher (SOU-96). `SwitchCenter` gates the Premium `org.multi-center`
  // feature server-side, then delegates the live hot-swap to the shell's
  // `switchTo` adapter. Without a wired shell (integration tests) the adapter
  // rejects — but only ever AFTER the plan gate, and the
  // single-center `center.list` still answers.
  const centerSwitchPort: CenterSwitchPort = {
    switchTo:
      options.centerSwitch?.switchTo ??
      (() => Promise.reject(new CenterSwitchError('center switching is not available'))),
  };
  const switchCenter = new SwitchCenter(plan, centerSwitchPort);
  const listCenters =
    options.centerSwitch?.listCenters ??
    ((): Promise<readonly CenterSummary[]> =>
      Promise.resolve([
        {
          centreId: options.centreId,
          centerCode: options.centerCode,
          displayName: options.centerCode,
          isActive: true,
        },
      ]));

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
  const dashboardBasicMetricsBuilder = new DashboardBasicMetricsBuilder({
    sessions: concreteSessionRepo,
    students: studentRepo,
    subscriptions: subscriptionRepo,
    invoices: invoiceRepo,
    groups: groupRepo,
    enrollments: enrollmentRepo,
    teachers: teacherRepo,
    recurringSessions: sessionRepo,
  });
  const getDashboardBasicSummary = new GetDashboardBasicSummary(
    dashboardBasicMetricsBuilder,
    clock,
    plan,
  );
  const getDashboardAdvancedSummary = new GetDashboardAdvancedSummary(
    invoiceRepo,
    subscriptionRepo,
    attendanceRepo,
    subjectRepo,
    holidayRepo,
    monthlyFeeAttribution,
    clock,
    plan,
  );

  // Per-center stats (SOU-106): a REAL read-only local aggregation across the
  // operator's installed centers — a deliberate, documented override of §5ter's
  // desktop "no merged views" rule for this Premium feature. The adapter opens each
  // `centre-*.db` read-only, one at a time, reads that center's own dashboard-shaped
  // money + student figures, and closes it (never a cross-DB write, never two open
  // at once). The `org.multi-center` gate is enforced in the use case, before any DB
  // is touched. `keyFor` falls back to this center's own key when the shell wires no
  // multi-center config, so a single-center install reads only its own file.
  const multiCenterStatsRead = new SqliteMultiCenterStatsRead(
    options.dir,
    options.multiCenterStats?.keyFor ?? (() => options.key),
    options.multiCenterStats?.excludeCentreIds ?? [],
  );
  const getMultiCenterStats = new GetMultiCenterStats(plan, multiCenterStatsRead, clock);
  const multiCenterStatsPdfRenderer = new PdfLibMultiCenterStatsRenderer();

  // Attendance reporting reads (SOU-108) — per-student history + absence summary
  // and printable per-group attendance sheet, both read-model reads over the
  // existing attendanceRepo (no new repository, no new adapter). Gated by
  // `core.attendance` (base tier) in the use case; IPC handler passes the throw
  // through the shared error mapping.
  const getStudentAttendanceReport = new GetStudentAttendanceReport(attendanceRepo, plan);
  const getGroupAttendanceSheet = new GetGroupAttendanceSheet(attendanceRepo, plan);

  // Backup & restore (SOU-102). `options.key` is the per-center derived key
  // (SOU-179 — master secret in the OS keychain, HKDF per centreId); both the
  // manual/scheduled snapshot path and the restore verify/swap path use it.
  // Backups are same-install only: a file created on another laptop won't
  // verify here (cross-machine restore lands with sync, SOU-13).
  // DB-key recovery escrow (SOU-302). The DB key (options.key) is sealed toward
  // the product recovery PUBLIC key and persisted as a sibling `.recovery` file —
  // one per center, next to the live DB at provisioning and next to every backup
  // so it travels with the copy. libsodium's WASM must be ready first, so the
  // escrow is built through an async factory and the seal-then-write is memoized;
  // both the provisioning write and the backup hook reuse one ready instance.
  let recoveryWriterPromise: Promise<RecoveryKeyEscrowWriter> | null = null;
  const recoveryEscrowWriter = (): Promise<RecoveryKeyEscrowWriter> => {
    recoveryWriterPromise ??= LibsodiumRecoveryKeyEscrow.create().then(
      (escrow) => new RecoveryKeyEscrowWriter(escrow, recoveryPublicKey()),
    );
    return recoveryWriterPromise;
  };
  const sealRecoverySibling = async (dbFilePath: string): Promise<void> => {
    const writer = await recoveryEscrowWriter();
    writer.writeSiblingFor(dbFilePath, options.key);
  };
  // Provision the live DB's sibling blob at launch — fire-and-forget so a WASM
  // load or disk hiccup can never block the window from opening.
  void sealRecoverySibling(join(options.dir, centreDbFileName(options.centreId))).catch((error: unknown) =>
    console.error('[recovery] sealing DB-key escrow blob failed', error),
  );

  const backupConfigStore = new SqliteBackupConfigStore(db);
  const backupAdapter = new SqliteBackupAdapter(db, options.key, ids, sealRecoverySibling);
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

  const saveCenterHours = new SaveCenterHours(centerHoursRepo, clock, ids, plan);
  const getCenterHours = new GetCenterHours(centerHoursRepo, plan);
  // Ramadan schedule overrides (SOU-165): CRUD on the time-boxed weekly-hours
  // replacement the generator above already reads. Same `settings.center-hours`
  // gate as the static hours screen (every plan).
  const saveCenterHoursOverride = new SaveCenterHoursOverride(centerHoursOverrideRepo, clock, ids, plan);
  const getCenterHoursOverrides = new GetCenterHoursOverrides(centerHoursOverrideRepo, plan);
  const getActiveCenterHoursOverride = new GetActiveCenterHoursOverride(centerHoursOverrideRepo, plan);
  const archiveCenterHoursOverride = new ArchiveCenterHoursOverride(centerHoursOverrideRepo, clock, plan);

  // Teacher availability (SOU-259): weekly windows + one-off absences, edited on
  // the Teacher screen and fed into the generator preview as forceable warnings.
  const teacherAvailabilityRepo = new SqliteTeacherAvailabilityRepository(db, changeLog);
  const teacherAvailabilityExceptionRepo = new SqliteTeacherAvailabilityExceptionRepository(db, changeLog);
  const saveTeacherAvailability = new SaveTeacherAvailability(
    teacherAvailabilityRepo,
    teacherRepo,
    clock,
    ids,
    plan,
  );
  const getTeacherAvailability = new GetTeacherAvailability(
    teacherAvailabilityRepo,
    teacherAvailabilityExceptionRepo,
    plan,
  );
  const saveTeacherAvailabilityException = new SaveTeacherAvailabilityException(
    teacherAvailabilityExceptionRepo,
    teacherRepo,
    clock,
    ids,
    plan,
  );
  const archiveTeacherAvailabilityException = new ArchiveTeacherAvailabilityException(
    teacherAvailabilityExceptionRepo,
    clock,
    plan,
  );

  // Read-only out-of-effective-hours audit (SOU-201): sweeps every live
  // materialized session against the CURRENT override-aware hours + holidays,
  // reusing the same repos the generator and hours screens already own. It reads
  // enriched occurrences off the same concreteSessionRepo, which also serves the
  // SessionOccurrenceViewReadPort (one class, several ports). Never mutates.
  const auditSessionsOutsideHours = new AuditSessionsOutsideEffectiveHours({
    occurrences: concreteSessionRepo,
    enrollments: enrollmentRepo,
    holidays: holidayRepo,
    centerHours: centerHoursRepo,
    overrides: centerHoursOverrideRepo,
    availability: teacherAvailabilityRepo,
    availabilityExceptions: teacherAvailabilityExceptionRepo,
    weeklySessions: sessionRepo,
    weeklyTemplates: sessionRepo,
    plan,
    clock,
  });

  // Per-occurrence cancel (SOU-201): soft-deletes a single stranded dated session
  // by its own Session.id, leaving the recurring template and its other
  // occurrences intact — distinct from cancelWeeklySession, which cancels the
  // whole series. Same core.calendar.week gate as the other calendar mutations.
  const cancelSession = new CancelSession(concreteSessionRepo, clock, plan);

  // Weekly recurring session write path (SOU-131): create/update run the SOU-55
  // composite conflict check (room + teacher + hours) against the same
  // `sessionRepo` that backs the planner read + the ArchiveRoom guard, reading the
  // center's configured week from `centerHoursRepo`. Cancel is a soft delete. All
  // three gate `core.calendar.week` in the domain.
  const weeklySessionScheduleValidator = new WeeklySessionScheduleValidator({
    sessions: sessionRepo,
    centerHours: centerHoursRepo,
    overrides: centerHoursOverrideRepo,
    availability: teacherAvailabilityRepo,
    availabilityExceptions: teacherAvailabilityExceptionRepo,
    enrollments: enrollmentRepo,
    clock,
    plan,
  });
  const createWeeklySession = new CreateWeeklyRecurringSession(
    sessionRepo,
    groupRepo,
    roomRepo,
    weeklySessionScheduleValidator,
    { clock, ids, plan },
  );
  const updateWeeklySession = new UpdateWeeklyRecurringSession(
    sessionRepo,
    groupRepo,
    roomRepo,
    weeklySessionScheduleValidator,
    { clock, plan },
  );
  // Re-check (SOU-283, SOU-287): the post-save availability drift read.
  const findSessionsOutsideTeacherAvailability = new FindSessionsOutsideTeacherAvailability(
    sessionRepo,
    concreteSessionRepo,
    teacherAvailabilityRepo,
    teacherAvailabilityExceptionRepo,
    { plan, clock },
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
    new GeneratedScheduleSeatFitGuard(groupRepo, roomRepo),
    createWeeklySession,
    generateSessions,
    plan,
  );
  const previewGeneratedSchedule = new PreviewGeneratedSchedule(
    groupRepo,
    roomRepo,
    centerHoursRepo,
    sessionRepo,
    teacherAvailabilityRepo,
    teacherAvailabilityExceptionRepo,
    enrollmentRepo,
    new SessionGenerator(new NodeRandomPort()),
    plan,
  );

  const hasher = new HashWasmPasswordHasher();
  const userRepo = new SqliteUserRepository(db, changeLog);
  // AdminAccount is now a compatibility view over the owner `users` row (SOU-252):
  // change-password / recovery-reset keep their port but share the one credential
  // store. Login, first-run, and invites go through userRepo directly.
  const adminRepo = new SqliteAdminAccountRepository(db, changeLog);
  const createAdminAccount = new CreateAdminAccount(userRepo, hasher, clock, ids, {
    centerCode: options.centerCode,
    deviceOrigin,
  });
  const verifyUserPassword = new VerifyUserPassword(userRepo, hasher);
  const changeAdminPassword = new ChangeAdminPassword(adminRepo, hasher, clock);

  const random = new NodeSecureRandom();
  const createUser = new CreateUser(userRepo, hasher, random, clock, ids);
  const redeemSetupCode = new RedeemSetupCode(userRepo, hasher, clock);
  const validateSetupCode = new ValidateSetupCode(userRepo, hasher, clock);
  const reissueSetupCode = new ReissueSetupCode(userRepo, hasher, random, clock);
  const setupCodeRecoveryUnitOfWork = new SqliteSetupCodeRecoveryUnitOfWork(db, changeLog);
  const recoverPassword = new RecoverPasswordWithSetupCode(
    userRepo,
    hasher,
    clock,
    ids,
    setupCodeRecoveryUnitOfWork,
  );
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
  const { resolveUpdatedBy, ...principalControls } = wireSessionPrincipal(deviceSessions, userRepo, DEV_USER);

  // Add-a-center flow (SOU-310). `CreateCenter` gates the Premium `org.multi-center`
  // feature server-side, provisions a fresh isolated per-center DB, then hands off
  // to the SOU-96 switch path to land in it. The provisioner needs the shell's
  // per-center key derivation (the keychain lives in main), so it is wired only when
  // the shell passes it — otherwise provisioning rejects (after the plan gate),
  // exactly like `center.switch` without a wired shell. The director who owns the
  // new center is the signed-in user (`resolveUpdatedBy`), never renderer input.
  const centerProvisioningPort: CenterProvisioningPort = options.provisioning
    ? new SqliteCenterProvisioning({
        dir: options.dir,
        keyFor: options.provisioning.keyFor,
        migrations: toMigrations(migrationFiles),
        clock,
        ids,
        hasActiveLicense: () =>
          resolveActivePlan(verifyLicenseCached(), clock.now(), licenseBinding).status === 'active',
        seedPlan: activePlanId,
        // Owner-only authorization (Qodo #8): the new center is owned by the
        // AUTHENTICATED caller, resolved from the live session principal — never an
        // arbitrary `findOwner()` row. A caller who is not the center's owner (a
        // secretary, or an unauthenticated invoke that resolves to the bootstrap
        // placeholder) yields null, and provisioning fails closed. This is the
        // honest-user gate that stops a lower-privileged user minting a center.
        currentOwner: async () => {
          const caller = await userRepo.findById(resolveUpdatedBy());
          return caller !== null && caller.role === 'owner' ? caller : null;
        },
      })
    : {
        provision: () =>
          Promise.reject(new CenterProvisioningError('center provisioning is not available')),
        discard: () => Promise.resolve(),
      };
  const createCenter = new CreateCenter(plan, centerProvisioningPort, centerSwitchPort);

  // Join-an-existing-center flow (SOU-318). `JoinCenter` gates `sync.multi-device`
  // then cold-bootstraps a local replica from the hub feed before switching in.
  const joinCenter = new JoinCenter(
    plan,
    options.joining
      ? new SqliteCenterJoinProvisioning({
          dir: options.dir,
          keyFor: options.joining.keyFor,
          migrations: toMigrations(migrationFiles),
          clock,
          ids,
          plan,
          hasActiveLicense: () =>
            resolveActivePlan(verifyLicenseCached(), clock.now(), licenseBinding).status === 'active',
          clientConfig: options.joining.clientConfig,
          systemUserId: DEV_USER,
        })
      : {
          provisionFromHub: () => Promise.reject(new CenterJoinError('joining is not available')),
          discard: () => Promise.resolve(),
        },
    centerSwitchPort,
  );
  const recoveryCodeResetUnitOfWork = new SqliteRecoveryCodeResetUnitOfWork(db, changeLog);
  const resetPasswordWithRecoveryCode = new ResetPasswordWithRecoveryCode(
    verifyRecoveryCode,
    adminRepo,
    recoveryCodeResetUnitOfWork,
    hasher,
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

  // Owner-email settings + the online email password-reset flow (SOU-273). The
  // relay only proves control of the owner's mailbox; the local password reset is
  // the recovery-code tail minus code consumption, committed atomically.
  const setOwnerEmail = new SetOwnerEmail(userRepo, clock);
  const emailPasswordResetUnitOfWork = new SqliteEmailPasswordResetUnitOfWork(db, changeLog);
  const resetPasswordAfterEmailVerification = new ResetPasswordAfterEmailVerification(
    userRepo,
    emailPasswordResetUnitOfWork,
    hasher,
    clock,
    ids,
  );
  // The relay origin is a build-time constant (production by default); the E2E
  // build alone reads a runtime CS_RELAY_URL to point at a mock, mirroring the
  // license-path seam so a release binary never reads the env.
  const relayBaseUrl =
    __CS_E2E__ && process.env['CS_RELAY_URL'] ? process.env['CS_RELAY_URL'] : __RELAY_BASE_URL__;
  const emailResetRelay = new HttpEmailResetRelay({ baseUrl: relayBaseUrl });
  // Per-user reset identity (SOU-303): resolve ANY account by the username the
  // locked-out staff typed, not just the owner. `accountId` is that user's id, so
  // the relay differentiates accounts; `email` is their own contact address (null
  // when none is on file). Returns null when no live account matches the username —
  // the handler reports that distinctly from "account exists but has no email".
  const resetIdentity = async (username: string) => {
    const user = await userRepo.findByUsername(username);
    if (user === null) return null;
    return {
      username: user.username,
      accountId: user.id,
      centerCode: user.centerCode,
      email: user.email ?? null,
    };
  };

  // Locale preference (SOU-31): a plain userData-file adapter, not a domain
  // port — see LocalePreferenceStore's doc for why. `options.dir` is the same
  // userData directory the center DB files and the logo store live under.
  const localePreferences = new LocalePreferenceStore(options.dir);

  // Embedded LAN hub (SOU-90). When enabled, the hub host's own replica syncs
  // to itself over localhost through the SAME SyncHubPort client as every other
  // device — this container never special-cases the hub machine. The listener
  // binds the configured port (fire-and-forget, like the scheduled backup): a
  // transient busy port is retried, then logged if it still fails; the sync page
  // (SOU-81) surfaces hub health. Real hub designation/setup UX is a later
  // ticket; the option is wired here so the seam exists before its consumer.
  let hubServerInstance: HubServer | null = null;
  let hubStore: SqliteHubStore | null = null;
  let syncHub: SyncHubPort | null = null;
  // Resolves once the embedded hub is actually listening — the initial self-push
  // (below) waits on it so it never pushes at a socket that is not up yet.
  let hubListening: Promise<number> | null = null;
  const hubConfig = options.hubServer;
  if (hubConfig) {
    hubStore = SqliteHubStore.open({ centreId: options.centreId, key: options.key, dir: options.dir }, clock);
    applyMigrations(hubStore.db, toMigrations(hubMigrationFiles));
    hubStore.registerCenter(options.centerCode, hubConfig.token, clock.now());
    hubServerInstance = new HubServer(hubStore, hubConfig.port, hubConfig.bindHost);
    const started = hubServerInstance.start({ retries: 10, retryDelayMs: 150 });
    hubListening = started;
    void started.catch((error: unknown) => {
      console.error('[hub] failed to start on port', hubConfig.port, error);
    });
    syncHub = new HttpSyncHubClient({
      baseUrl: `http://${hubConfig.bindHost}:${hubConfig.port}`,
      token: hubConfig.token,
    });
  } else if (options.hubClient) {
    // Client-only (SOU-82): this device serves no hub — it points at an external
    // bare hub through the SAME HttpSyncHubClient a hub host uses for its own
    // listener. The only difference from a hub host is that no canonical store or
    // listener is opened here; the sync engine below drives this client identically.
    syncHub = new HttpSyncHubClient({
      baseUrl: options.hubClient.baseUrl,
      token: options.hubClient.token,
    });
  }

  // Sync engine + conflict resolution (SOU-91). The local sync store and the
  // duplicate-match source are always wired (they back the "conflits en
  // attente" inbox even before a hub exists); the engine itself only runs when
  // a hub is configured, mirroring `syncHub` — `sync.run` then reports a null
  // result ("not paired") to the renderer instead of failing.
  const localSyncRepository: LocalSyncRepository &
    SubjectCodeCollisionStore &
    SessionDedupStore &
    PaymentReversalDedupStore &
    UserCredentialDuplicateStore = new SqliteLocalSyncRepository(
    db,
    clock,
    deviceOrigin,
    options.centerCode,
  );
  // The device-side outbox (SOU-180): drains this device's local `change_log`
  // writes into pushable pending changes before each sync run, the missing
  // bridge that lets a real user edit actually reach the hub.
  const syncOutbox = new ChangeLogOutbox(
    db,
    localSyncRepository,
    options.centerCode,
    deviceOrigin,
    DEV_USER,
  );
  const duplicateMatchSource = new SqliteDuplicateMatchSource(db);
  const matcher = new DuplicateMatcher(duplicateMatchSource);
  const syncEngine = syncHub
    ? new SyncEngine({
        hub: syncHub,
        local: localSyncRepository,
        clock,
        plan,
        deviceId: deviceOrigin,
        updatedBy: DEV_USER,
        centreId: options.centerCode,
        userCanResolve: true,
        subjectCollisionStore: localSyncRepository,
        sessionDedupStore: localSyncRepository,
        paymentReversalDedupStore: localSyncRepository,
        userCredentialDuplicateStore: localSyncRepository,
      })
    : null;
  const resolveConflict = new ResolveConflict(localSyncRepository, clock, plan, localSyncRepository);

  // Initial self-push (SOU-318): a freshly designated hub host must publish its
  // existing center to the canonical store BEFORE any laptop joins — otherwise a
  // joining device pulls an empty feed and cold-bootstraps nothing. Once the hub
  // is listening, drain this device's outbox and run one sync cycle against its
  // own localhost hub (the same self-sync path every hub host uses). Fire-and-
  // forget and idempotent: a second run simply finds nothing new to push. Only a
  // hub host does this — a client-only device has no canonical store to seed.
  if (hubServerInstance && syncEngine && hubListening) {
    void hubListening
      .then(() => {
        syncOutbox.drain();
        return syncEngine.run(matcher);
      })
      .catch((error: unknown) => {
        console.error('[hub] initial self-push failed', error);
      });
  }

  // Hosting designation service (SOU-318): turns the open center's hub role on/off
  // as a config write; null in wirings without a hosting config (tests).
  const hubHostingService = options.hubHosting
    ? new HubHostingService({
        config: options.hubHosting.config,
        resolveBindHost: options.hubHosting.resolveBindHost,
        randomBytes: options.hubHosting.randomBytes,
      })
    : null;

  // mDNS advertisement (SOU-318): once the hub is listening, publish the center on
  // the LAN so a second laptop can discover it — identity only in the TXT record,
  // never the pairing token. Withdrawn on dispose (center switch / quit).
  let hubAdvertisement: HubAdvertisement | null = null;
  // The advertisement is published inside an async chain (below) while `dispose`
  // is synchronous, so the two can race: if `dispose` runs before the chain
  // resolves, it sees a null advertisement and its `stop()` is a no-op, leaving
  // the ad the chain publishes moments later stranded on the LAN. This flag lets
  // the chain detect a dispose that already happened and stop the fresh ad at once.
  let hubDisposed = false;
  if (hubConfig && options.hubHosting?.advertiser && hubListening) {
    const advertiser = options.hubHosting.advertiser;
    void hubListening
      .then(async () => {
        const profile = await getCenterProfile.execute();
        const name = profile?.name ?? options.centerCode;
        const advertisement = advertiser.advertise({
          name,
          port: hubConfig.port,
          txt: { centreId: options.centreId, centerCode: options.centerCode, name },
        });
        if (hubDisposed) {
          advertisement.stop();
        } else {
          hubAdvertisement = advertisement;
        }
      })
      .catch((error: unknown) => {
        console.error('[hub] mDNS advertise failed', error);
      });
  }

  const attemptLogin = new AttemptLogin(
    verifyUserPassword,
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
    activePlanFeatures: () => plan.activeFeatures(),
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
    createNiveau,
    updateNiveau,
    archiveNiveau,
    listNiveaux,
    getNiveau,
    listNiveauxWithUsage,
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
    listRecentPayments,
    getDayTakings,
    generateMonthlyInvoices,
    listInvoices,
    listOverdueInvoices,
    issueInvoice,
    cancelInvoice,
    updateDraftInvoiceLineAmount,
    setInvoiceSubjectAllocation,
    invoicePdfRenderer,
    getDayCloseReport,
    dayCloseReportPdfRenderer,
    getParentMonthlyStatement,
    parentStatementPdfRenderer,
    teacherRosterPdfRenderer,
    enrollStudent,
    unenrollStudent,
    createTeacher,
    listTeachers,
    searchPeople,
    getTeacher,
    updateTeacher,
    archiveTeacher,
    restoreTeacher,
    getTeacherRoster,
    createTeacherPayrollRule,
    closeTeacherPayrollRule,
    replaceTeacherPayrollRule,
    listTeacherPayrollRulesByTeacher,
    computeMonthlyPayrolls,
    confirmTeacherPayout,
    confirmMonthlyPayrolls,
    listTeacherPayouts,
    getTeacherAttributionBreakdown,
    getPayrollProjection,
    currentUserId: () => resolveUpdatedBy(),
    generatePayslipPdf,
    generatePaymentReceiptPdf,
    createHoliday,
    listHolidays,
    updateHoliday,
    archiveHoliday,
    restoreHoliday,
    getDashboardBasicSummary,
    getDashboardAdvancedSummary,
    getMultiCenterStats,
    multiCenterStatsPdfRenderer,
    getStudentAttendanceReport,
    getGroupAttendanceSheet,
    listWeekSessions,
    scheduleRenderer,
    tempDir: options.tempDir,
    generateSessions,
    undoGenerationBatch,
    resetPlanning,
    auditSessionsOutsideHours,
    cancelSession,
    recordSessionAttendance,
    createWeeklySession,
    updateWeeklySession,
    cancelWeeklySession,
    findSessionsOutsideTeacherAvailability,
    previewGeneratedSchedule,
    commitGeneratedSchedule,
    saveCenterHours,
    getCenterHours,
    saveCenterHoursOverride,
    getCenterHoursOverrides,
    getActiveCenterHoursOverride,
    archiveCenterHoursOverride,
    saveTeacherAvailability,
    getTeacherAvailability,
    saveTeacherAvailabilityException,
    archiveTeacherAvailabilityException,
    envelopeContext: () => ({ ...context, updatedBy: resolveUpdatedBy() }),
    adminExists: () => adminRepo.exists(),
    adminUsername: async () => {
      const account = await adminRepo.findOnly();
      return account?.username ?? '';
    },
    createAdminAccount,
    createUser,
    redeemSetupCode,
    validateSetupCode,
    reissueSetupCode,
    recoverPassword,
    listUsers: () => userRepo.listActive(context.centerCode),
    now: () => clock.now(),
    changeAdminPassword,
    attemptLogin,
    deviceSessions,
    ...principalControls,
    generateRecoveryCodes,
    verifyRecoveryCode,
    resetPasswordWithRecoveryCode,
    countRemainingRecoveryCodes: () => recoveryCodeRepo.countUnconsumed(),
    setSecurityQuestions,
    verifySecurityAnswers,
    requestPasswordResetViaSecurityQuestions,
    securityQuestionsExist: () => securityQuestionRepo.exists(),
    setOwnerEmail,
    resetPasswordAfterEmailVerification,
    resetIdentity,
    ownerEmail: async () => (await userRepo.findOwner())?.email ?? null,
    emailResetRelay,
    getCenterProfile,
    saveCenterProfile,
    storeCenterLogo,
    readCenterLogo,
    // Center switcher (SOU-96): the plan-gated switch use case, the directory
    // scan closure, and the open center's discriminator for `center.current`.
    switchCenter,
    listCenters,
    // Add-a-center flow (SOU-310): the plan-gated create+provision+switch use case.
    createCenter,
    currentCentreId: () => options.centreId,
    centerContext: () => ({ ...centerContext, updatedBy: resolveUpdatedBy() }),
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
    updatedBy: () => resolveUpdatedBy(),
    dbKey: () => options.key,
    scheduleRestart: options.scheduleRestart,
    plan,
    syncEngine,
    syncOutbox,
    matcher,
    resolveConflict,
    listBlockedConflicts: () => localSyncRepository.listBlocked(),
    localSyncRepository,
    deviceId: () => deviceOrigin,
    emitSyncProgress: options.emitSyncProgress ?? (() => {}),
    hubHosting: hubHostingService,
    hubDiscoverer: options.hubHosting?.discoverer ?? null,
    requestHubRestart: options.scheduleRestart,
    joinCenter,
  };

  return {
    handlerDeps,
    db,
    subscriptionReference,
    syncHub,
    isRestricted,
    isSetupComplete,
    readLocalePreference: () => localePreferences.read(),
    // `db.open` guards against a double-close: a successful restore (SOU-102)
    // already closed this handle as part of its file swap, and `will-quit`
    // still calls `dispose()` during the scheduled relaunch. The hub store is
    // closed only AFTER the listener has stopped, so an in-flight request can
    // never hit a half-closed canonical store.
    dispose: () => {
      // Withdraw the LAN advertisement first so no laptop discovers a hub that is
      // about to stop (SOU-318). Set `hubDisposed` so an advertisement still being
      // published by the async chain above stops itself instead of stranding.
      hubDisposed = true;
      hubAdvertisement?.stop();
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
