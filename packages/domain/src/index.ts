/**
 * @centresoutien/domain — the portable core.
 *
 * Zero platform dependencies: no React, no Electron, no SQLite, no Node builtins.
 * Compiled with `lib: ["ES2022"]` (no DOM) and zero workspace dependencies.
 */
export const DOMAIN_PACKAGE = '@centresoutien/domain' as const;

// Value objects
export type { Brand } from './value-objects/brand';
export type { CenterCode, DeviceId, UserId, EntityId } from './value-objects/ids';
export { ULID_REGEX, isUlid, hasIdPrefix } from './value-objects/ids';
export type { PhoneNumber, PhoneRegion } from './value-objects/phone-number';
export { normalizePhone, InvalidPhoneNumberError } from './value-objects/phone-number';
export type { TimeOfDay } from './value-objects/time-of-day';
export { TIME_OF_DAY_REGEX, isTimeOfDay, toMinutes } from './value-objects/time-of-day';
export type { WeekdayIndex } from './value-objects/weekday';
export { WEEKDAYS, isWeekdayIndex } from './value-objects/weekday';
export type { DateRange } from './value-objects/date-range';
export { weekdayOf, eachDateInRange } from './value-objects/date-range';
export type { GuardianRelation } from './value-objects/guardian-relation';
export { GUARDIAN_RELATIONS, isGuardianRelation } from './value-objects/guardian-relation';

// Ports
export type { Clock } from './ports/clock';
export type { IdGenerator } from './ports/id-generator';

// Entity base + envelope
export type { EntityEnvelope, NewEnvelopeInput } from './entities/envelope';
export { ENVELOPE_FIELD_NAMES, newEnvelope, acceptHubVersion } from './entities/envelope';
export type { WriteContext, WriteResult } from './entities/write';
export { applyWrite } from './entities/write';

// Sync
export { diffChangedFields } from './sync/change-log';

// Duplicate-matching policy (people-like naturalKey)
export { normalizeNaturalKey } from './policies/natural-key';

// Repository ports
export type { SoftDeletableRepository } from './repositories/soft-deletable';

// Plans & gating
export type { PlanId, FeatureFlag, PlanLimits, Plan } from './plans/plans';
export { PLANS } from './plans/plans';
export { PlanPolicy } from './plans/plan-policy';
export { DomainError, PlanFeatureUnavailableError, PlanLimitExceededError } from './errors/plan-errors';
export {
  AdminAccountAlreadyExistsError,
  AdminAccountNotFoundError,
  InvalidCurrentPasswordError,
} from './errors/auth-errors';
export { StudentNotFoundError } from './errors/student-errors';
export {
  DuplicateParentError,
  ParentNotFoundError,
  DuplicateTeacherError,
  TeacherNotFoundError,
  TeacherInUseError,
} from './errors/people-errors';
export { RoomInUseError, RoomNotFoundError } from './errors/room-errors';
export {
  SubjectInUseError,
  SubjectNotFoundError,
  DuplicateSubjectCodeError,
} from './errors/subject-errors';
export { HolidayNotFoundError } from './errors/holiday-errors';
export {
  GroupOverCapacityError,
  GroupSubjectUnavailableError,
  GroupNotFoundError,
} from './errors/group-errors';
export type { GroupSubjectUnavailableReason } from './errors/group-errors';
export {
  GroupFullError,
  CrossKindEnrollmentError,
  DuplicateEnrollmentError,
  EnrollmentSubscriptionMissingError,
  EnrollmentNotFoundError,
} from './errors/enrollment-errors';
export {
  InvalidInvoiceTransitionError,
  InvoiceNotFoundError,
  DuplicateInvoiceError,
} from './errors/invoice-errors';
export {
  PaymentNotFoundError,
  CannotReverseReversalError,
  PaymentAlreadyReversedError,
} from './errors/payment-errors';
export {
  TooManyActiveSubscriptionsError,
  StudentSubscriptionNotFoundError,
} from './errors/subscription-errors';
export { FormulaImmutableError, FormulaNotFoundError, FormulaSubjectUnavailableError } from './errors/formula-errors';
export type { FormulaSubjectUnavailableReason } from './errors/formula-errors';
export {
  TooManyActivePayrollRulesError,
  TeacherPayrollRuleNotFoundError,
} from './errors/payroll-errors';
export {
  SessionOutsideCenterHoursError,
  RoomConflictError,
  SessionOnHolidayError,
  TeacherConflictError,
  MalformedSessionTimeError,
  InvalidSessionValidityRangeError,
  WeeklyRecurringSessionNotFoundError,
} from './errors/scheduling-errors';
export type { OutsideCenterHoursReason, ScheduledSessionRef } from './errors/scheduling-errors';

// Input validation schemas (shared by forms via zodResolver and by use cases)
export {
  subjectInputSchema,
  subjectUpdateInputSchema,
  SUBJECT_NAME_MAX,
  SUBJECT_CODE_MAX,
  SUBJECT_CODE_PATTERN,
} from './schemas/subject';
export type { SubjectInput, SubjectUpdateInput } from './schemas/subject';
export {
  studentInputSchema,
  isCalendarDate,
  STUDENT_NAME_MAX,
  STUDENT_LEVEL_MAX,
  STUDENT_SCHOOL_MAX,
  STUDENT_NOTES_MAX,
} from './schemas/student';
export type { StudentInput } from './schemas/student';
export {
  adminCredentialsSchema,
  changeAdminPasswordSchema,
  USERNAME_MIN,
  USERNAME_MAX,
  PASSWORD_MIN,
  PASSWORD_MAX,
} from './schemas/admin-account';
export type { AdminCredentials, ChangeAdminPasswordCredentials } from './schemas/admin-account';
export {
  weekdayHoursSchema,
  weeklyHoursSchema,
  DEFAULT_OPEN,
  DEFAULT_CLOSE,
  DEFAULT_WEEKLY_HOURS,
} from './schemas/center-hours';
export type { WeekdayHoursInput, WeeklyHoursInput } from './schemas/center-hours';
export { loginInputSchema } from './schemas/login';
export type { LoginInput } from './schemas/login';
export {
  parentInputSchema,
  PARENT_NAME_MAX,
  PARENT_PHONE_MAX,
  PARENT_EMAIL_MAX,
} from './schemas/parent';
export type { ParentInput } from './schemas/parent';
export { roomInputSchema, ROOM_NAME_MAX, ROOM_CAPACITY_MIN } from './schemas/room';
export type { RoomInput } from './schemas/room';
export { holidayInputSchema, HOLIDAY_NAME_MAX } from './schemas/holiday';
export type { HolidayInput } from './schemas/holiday';
export { groupInputSchema, GROUP_LEVEL_MAX, GROUP_CAPACITY_MIN } from './schemas/group';
export type { GroupInput } from './schemas/group';
export { enrollmentInputSchema, MONTH_PATTERN } from './schemas/enrollment';
export type { EnrollmentInput } from './schemas/enrollment';
export { generateSessionsSchema } from './schemas/session';
export type { GenerateSessionsRequest } from './schemas/session';
export {
  weeklyRecurringSessionInputSchema,
  weeklyRecurringSessionUpdateSchema,
} from './schemas/weekly-recurring-session';
export type {
  WeeklyRecurringSessionInput,
  WeeklyRecurringSessionUpdateInput,
} from './schemas/weekly-recurring-session';
export {
  invoiceLineSnapshotSchema,
  createInvoiceDraftSchema,
  generateMonthlyInvoicesSchema,
  INVOICE_LINE_LABEL_MAX,
} from './schemas/invoice';
export type {
  InvoiceLineSnapshot,
  CreateInvoiceDraftFields,
  GenerateMonthlyInvoicesFields,
} from './schemas/invoice';
export { recordPaymentSchema, voidPaymentSchema } from './schemas/payment';
export type { RecordPaymentFields, VoidPaymentFields } from './schemas/payment';
export {
  studentSubscriptionInputSchema,
  closeStudentSubscriptionMonthSchema,
} from './schemas/student-subscription';
export type { StudentSubscriptionInput } from './schemas/student-subscription';
export { formulaInputSchema, FORMULA_NAME_MAX } from './schemas/formula';
export type { FormulaInput } from './schemas/formula';
export {
  teacherPayrollRuleInputSchema,
  closeTeacherPayrollRuleMonthSchema,
} from './schemas/teacher-payroll-rule';
export type { TeacherPayrollRuleInput } from './schemas/teacher-payroll-rule';
export {
  teacherInputSchema,
  TEACHER_NAME_MAX,
  TEACHER_CIN_MAX,
  TEACHER_PHONE_MAX,
  TEACHER_EMAIL_MAX,
} from './schemas/teacher';
export type { TeacherInput } from './schemas/teacher';
export {
  centerProfileSchema,
  logoUploadSchema,
  LOGO_EXTENSIONS,
  LOGO_MAX_BYTES,
  CENTER_NAME_MAX,
  CENTER_ADDRESS_MAX,
  CENTER_PHONE_MAX,
  CENTER_EMAIL_MAX,
  CENTER_LOGO_PATH_MAX,
} from './schemas/center';
export type { CenterProfileInput, LogoExtension } from './schemas/center';
export {
  createBackupInputSchema,
  backupConfigInputSchema,
  BACKUP_DESTINATION_DIR_MAX,
  BACKUP_RETENTION_MIN,
  BACKUP_RETENTION_MAX,
} from './schemas/backup';
export type { CreateBackupInputSchema, BackupConfigInput } from './schemas/backup';

// Entities
export { SUBJECT_ID_PREFIX } from './entities/subject';
export type { Subject, SubjectId } from './entities/subject';
export { STUDENT_ID_PREFIX } from './entities/student';
export type { Student, StudentId } from './entities/student';
export { CENTER_HOURS_ID_PREFIX, isClosed } from './entities/center-hours';
export type { CenterHours, CenterHoursId } from './entities/center-hours';
export { ADMIN_ACCOUNT_ID_PREFIX } from './entities/admin-account';
export type { AdminAccount, AdminAccountId } from './entities/admin-account';
export {
  DEVICE_SESSION_ID_PREFIX,
  DEVICE_SESSION_TTL_MS,
  isSessionActive,
} from './entities/device-session';
export type { DeviceSession, DeviceSessionId } from './entities/device-session';
export { CENTER_ID_PREFIX } from './entities/center';
export type { Center, CenterId } from './entities/center';
export { PARENT_ID_PREFIX } from './entities/parent';
export type { Parent, ParentId } from './entities/parent';
export { ROOM_ID_PREFIX } from './entities/room';
export type { Room, RoomId } from './entities/room';
export { TEACHER_ID_PREFIX } from './entities/teacher';
export type { Teacher, TeacherId } from './entities/teacher';
export { HOLIDAY_ID_PREFIX } from './entities/holiday';
export type { Holiday, HolidayId, HolidayKind } from './entities/holiday';
export { GROUP_ID_PREFIX, GROUP_KINDS } from './entities/group';
export type { Group, GroupId, GroupKind } from './entities/group';
export { ENROLLMENT_ID_PREFIX } from './entities/enrollment';
export type { Enrollment, EnrollmentId } from './entities/enrollment';
export { INVOICE_ID_PREFIX, INVOICE_STATUSES } from './entities/invoice';
export type { Invoice, InvoiceId, InvoiceStatus } from './entities/invoice';
export { INVOICE_LINE_ID_PREFIX } from './entities/invoice-line';
export type { InvoiceLine, InvoiceLineId } from './entities/invoice-line';
export { PAYMENT_ID_PREFIX, PAYMENT_KINDS, PAYMENT_METHODS } from './entities/payment';
export type { Payment, PaymentId, PaymentKind, PaymentMethod } from './entities/payment';
export { STUDENT_SUBSCRIPTION_ID_PREFIX } from './entities/student-subscription';
export type { StudentSubscription, StudentSubscriptionId } from './entities/student-subscription';
export { FORMULA_ID_PREFIX } from './entities/formula';
export type { Formula, FormulaId } from './entities/formula';
export {
  TEACHER_PAYROLL_RULE_ID_PREFIX,
  TEACHER_PAYROLL_RULE_KINDS,
} from './entities/teacher-payroll-rule';
export type {
  TeacherPayrollRule,
  TeacherPayrollRuleId,
  TeacherPayrollRuleKind,
} from './entities/teacher-payroll-rule';
export {
  WEEKLY_RECURRING_SESSION_ID_PREFIX,
  toScheduledSessionRef,
  createWeeklyRecurringSession,
} from './entities/weekly-recurring-session';
export type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
  WeeklyRecurringSessionDraft,
} from './entities/weekly-recurring-session';
export { SESSION_ID_PREFIX } from './entities/session';
export type { Session, SessionId } from './entities/session';

// Read models (denormalized, envelope-free — never persisted)
export type { WeeklySessionView } from './read-models/weekly-session-view';

// Value objects & policies (login throttle — SOU-27)
export { UNLOCKED_STATE } from './value-objects/lockout-state';
export type { LockoutState } from './value-objects/lockout-state';
export {
  LoginThrottlePolicy,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from './policies/login-throttle-policy';

// Repository & service ports
export type {
  SubjectRepository,
  SubjectUsage,
  SubjectUsageReference,
  SubjectUsageReferenceKind,
} from './ports/subject-repository';
export { SUBJECT_USAGE_REFERENCE_KINDS } from './ports/subject-repository';
// Subject in-use guard — its concrete adapter (SOU-46) is the live-groups
// reference query; sessions/formulas join the scope once they reference subjects.
export type { SubjectReferencePort } from './ports/subject-reference';
export type { StudentRepository } from './ports/student-repository';
export type { CenterHoursRepository } from './ports/center-hours-repository';
export type { AdminAccountRepository } from './ports/admin-account-repository';
export type { PasswordHasher } from './ports/password-hasher';
export type { LoginThrottleStore } from './ports/login-throttle-store';
export type { DeviceSessionStore } from './ports/device-session-store';
export type { CenterRepository } from './ports/center-repository';
export type { LogoStore } from './ports/logo-store';
// Backup & restore (SOU-102) — mirrors the Clock/IdGenerator port pattern.
export type { BackupPort, BackupFileInfo, BackupVerification } from './ports/backup-port';
export type { BackupConfigStore, BackupConfig } from './ports/backup-config-store';
export { DEFAULT_BACKUP_RETENTION_COUNT } from './ports/backup-config-store';
export type { ParentRepository } from './ports/parent-repository';
export type { RoomRepository } from './ports/room-repository';
export type { TeacherRepository } from './ports/teacher-repository';
// Teacher in-use guard — DECLARED CONTRACT ONLY; real adapter lands with Groups
// (SOU-48) / payroll (SOU-70). Stubbed "never referenced" at the composition root.
export type { TeacherReferencePort } from './ports/teacher-reference';
export type { HolidayRepository } from './ports/holiday-repository';
export type { GroupRepository } from './ports/group-repository';
// Enrollment repository — port declared here; SQLite adapter + migration are a follow-up.
export type { EnrollmentRepository } from './ports/enrollment-repository';
export type { InvoiceRepository } from './ports/invoice-repository';
// Formula repository (SOU-61) — save() never writes isImmutable; the SQLite
// trigger is the sole writer, flipped when an InvoiceLine first references it.
export type { FormulaRepository } from './ports/formula-repository';
// Payment ledger (SOU-93) — append-only; the SQLite adapter adds a trigger safety net.
export type { PaymentReader, PaymentRepository } from './ports/payment-repository';
// StudentSubscription repository (SOU-63) — port + SQLite adapter land together.
export type { StudentSubscriptionRepository } from './ports/student-subscription-repository';
// TeacherPayrollRule repository (SOU-70) — port declared here; SQLite adapter +
// migration are SOU-71's scope.
export type { TeacherPayrollRuleRepository } from './ports/teacher-payroll-rule-repository';
// Student-subscription coverage — DECLARED CONTRACT ONLY; real adapter lands with
// StudentSubscription (SOU-63). Drives the EnrollStudent coverage + cross-kind guards.
export type {
  StudentSubscriptionReferencePort,
  ActiveSubscriptionCoverage,
} from './ports/student-subscription-reference';
export type { WeeklyRecurringSessionRepository } from './ports/weekly-recurring-session-repository';
// Planner grid enriched week read (SOU-118) — cross-aggregate read model, served by
// the same SQLite adapter that owns weekly_recurring_sessions.
export type { WeeklySessionViewReadPort } from './ports/weekly-session-view-read-port';
export type { SessionRepository } from './ports/session-repository';
// Room in-use guard — its concrete adapter is the weekly-session repo (SOU-53).
export type { RoomReferencePort } from './ports/room-reference';
// Student↔parent link — DECLARED CONTRACT ONLY (implemented after SOU-38 merges).
export { STUDENT_PARENT_LINK_ID_PREFIX } from './ports/student-parent-link';
export type {
  StudentParentLink,
  StudentParentLinkId,
  StudentParentLinkRepository,
} from './ports/student-parent-link';

// Domain services
export { DeviceSessionService } from './services/device-session-service';

// Policies
export { SessionConflictPolicy } from './policies/session-conflict-policy';
export type {
  SessionTimeCandidate,
  RoomSessionCandidate,
  TeacherSessionCandidate,
  DayHours,
} from './policies/session-conflict-policy';
export { teacherTeachesSubject } from './policies/teacher-teaches-subject';
export { holidayCoversDate, holidayOn } from './policies/holiday-policy';
export type { HolidayOccurrence } from './policies/holiday-policy';
export { detectSessionConflicts } from './policies/composite-session-conflicts';
export type {
  ConflictSeverity,
  SessionConflict,
  CompositeSessionCandidate,
  ConflictCheckContext,
} from './policies/composite-session-conflicts';
export { buildStudentNaturalKey, buildTeacherNaturalKey } from './policies/natural-key';
export { INVOICE_STATUS_TRANSITIONS, canTransitionInvoice } from './policies/invoice-status';
export { invoiceTotalMad } from './policies/invoice-total';
export {
  PAYMENT_STATUSES,
  netPaidMad,
  paymentStatusOf,
  derivePaymentStatus,
} from './policies/payment-status';
export type { PaymentStatus } from './policies/payment-status';
export { detectProbableDoubleEntry, detectDuplicateReversals } from './policies/payment-duplicate';
export type { DoubleEntryCandidate, ReversalCandidate } from './policies/payment-duplicate';
export {
  isSubscriptionActiveInMonth,
  subscriptionRangesOverlap,
  findActiveCoverage,
} from './policies/student-subscription-policy';
export {
  isPayrollRuleActiveInMonth,
  payrollRuleRangesOverlap,
} from './policies/teacher-payroll-rule-policy';
export { updateFormula, deactivateFormula } from './policies/formula-policy';
export type { FormulaPatch } from './policies/formula-policy';
export { validateFormulaSubjects } from './policies/validate-formula-subjects';

// First-run wizard state machine (SOU-25) — a pure, portable sequencer.
export type { WizardStepId } from './wizard/wizard-steps';
export { MANDATORY_STEP_IDS, OPTIONAL_STEP_IDS, isMandatoryStep } from './wizard/wizard-steps';
export type { WizardState, WizardStatus } from './wizard/wizard-machine';
export {
  initWizard,
  currentStep,
  isStepComplete,
  submitStep,
  skipStep,
  goToPreviousStep,
} from './wizard/wizard-machine';
export {
  WizardStepNotSkippableError,
  WizardCompletedError,
  WizardAtFirstStepError,
} from './errors/wizard-errors';

// Use cases
export { CreateSubject } from './use-cases/create-subject';
export type { CreateSubjectInput } from './use-cases/create-subject';
export { ArchiveSubject } from './use-cases/archive-subject';
export type { ArchiveSubjectInput } from './use-cases/archive-subject';
export { ListSubjects } from './use-cases/list-subjects';
export type { ListSubjectsInput, SubjectScope } from './use-cases/list-subjects';
export { GetSubject } from './use-cases/get-subject';
export type { GetSubjectInput } from './use-cases/get-subject';
export { ListSubjectsWithUsage } from './use-cases/list-subjects-with-usage';
export type { ListSubjectsWithUsageInput } from './use-cases/list-subjects-with-usage';
export { UpdateSubject } from './use-cases/update-subject';
export type { UpdateSubjectInput } from './use-cases/update-subject';
export { CreateStudent } from './use-cases/create-student';
export type { CreateStudentInput } from './use-cases/create-student';
export { ListStudents } from './use-cases/list-students';
export type { ListStudentsInput } from './use-cases/list-students';
export { GetStudent } from './use-cases/get-student';
export type { GetStudentInput } from './use-cases/get-student';
export { UpdateStudent } from './use-cases/update-student';
export type { UpdateStudentInput } from './use-cases/update-student';
export { ArchiveStudent } from './use-cases/archive-student';
export type { ArchiveStudentInput } from './use-cases/archive-student';
export { CreateParent } from './use-cases/create-parent';
export type { CreateParentInput } from './use-cases/create-parent';
export { ListParents } from './use-cases/list-parents';
export type { ListParentsInput } from './use-cases/list-parents';
export { GetParent } from './use-cases/get-parent';
export type { GetParentInput } from './use-cases/get-parent';
export { UpdateParent } from './use-cases/update-parent';
export type { UpdateParentInput } from './use-cases/update-parent';
export { ArchiveParent } from './use-cases/archive-parent';
export type { ArchiveParentInput } from './use-cases/archive-parent';
export { ListParentChildren } from './use-cases/list-parent-children';
export type { ListParentChildrenInput } from './use-cases/list-parent-children';
export { CreateRoom } from './use-cases/create-room';
export type { CreateRoomInput } from './use-cases/create-room';
export { CreateGroup } from './use-cases/create-group';
export type { CreateGroupInput } from './use-cases/create-group';
export { EnrollStudent } from './use-cases/enroll-student';
export type { EnrollStudentInput } from './use-cases/enroll-student';
export { UnenrollStudent } from './use-cases/unenroll-student';
export type { UnenrollStudentInput } from './use-cases/unenroll-student';
export { CreateInvoiceDraft } from './use-cases/create-invoice-draft';
export type {
  CreateInvoiceDraftInput,
  CreateInvoiceDraftResult,
} from './use-cases/create-invoice-draft';
export { IssueInvoice } from './use-cases/issue-invoice';
export type { IssueInvoiceInput } from './use-cases/issue-invoice';
export { CancelInvoice } from './use-cases/cancel-invoice';
export type { CancelInvoiceInput } from './use-cases/cancel-invoice';
export { RecordPayment } from './use-cases/record-payment';
export type { RecordPaymentInput, RecordPaymentResult } from './use-cases/record-payment';
export { VoidPayment } from './use-cases/void-payment';
export type { VoidPaymentInput } from './use-cases/void-payment';
export { GetInvoicePaymentSummary } from './use-cases/get-invoice-payment-summary';
export type {
  GetInvoicePaymentSummaryInput,
  InvoicePaymentSummary,
} from './use-cases/get-invoice-payment-summary';
export { CreateStudentSubscription } from './use-cases/create-student-subscription';
export type { CreateStudentSubscriptionInput } from './use-cases/create-student-subscription';
export { CloseStudentSubscription } from './use-cases/close-student-subscription';
export type { CloseStudentSubscriptionInput } from './use-cases/close-student-subscription';
export { ListStudentSubscriptions } from './use-cases/list-student-subscriptions';
export type { ListStudentSubscriptionsInput } from './use-cases/list-student-subscriptions';
export { GenerateMonthlyInvoices } from './use-cases/generate-monthly-invoices';
export type {
  GenerateMonthlyInvoicesInput,
  GenerateMonthlyInvoicesResult,
} from './use-cases/generate-monthly-invoices';
export { CreateTeacherPayrollRule } from './use-cases/create-teacher-payroll-rule';
export type { CreateTeacherPayrollRuleInput } from './use-cases/create-teacher-payroll-rule';
export { CloseTeacherPayrollRule } from './use-cases/close-teacher-payroll-rule';
export type { CloseTeacherPayrollRuleInput } from './use-cases/close-teacher-payroll-rule';
export { ListTeacherPayrollRulesByTeacher } from './use-cases/list-teacher-payroll-rules-by-teacher';
export type { ListTeacherPayrollRulesByTeacherInput } from './use-cases/list-teacher-payroll-rules-by-teacher';
export { ListGroups, orderGroupsForList } from './use-cases/list-groups';
export type { ListGroupsInput, GroupScope } from './use-cases/list-groups';
export { ListGroupsWithCounts } from './use-cases/list-groups-with-counts';
export type { GroupWithCount } from './use-cases/list-groups-with-counts';
export { GetGroupRoster } from './use-cases/get-group-roster';
export type { GetGroupRosterInput, GroupRosterEntry } from './use-cases/get-group-roster';
export { UpdateGroup } from './use-cases/update-group';
export type { UpdateGroupInput } from './use-cases/update-group';
export { ArchiveGroup } from './use-cases/archive-group';
export type { ArchiveGroupInput } from './use-cases/archive-group';
export { RestoreGroup } from './use-cases/restore-group';
export type { RestoreGroupInput } from './use-cases/restore-group';
export { ArchiveRoom } from './use-cases/archive-room';
export type { ArchiveRoomInput } from './use-cases/archive-room';
export { ListRooms } from './use-cases/list-rooms';
export type { ListRoomsInput, RoomScope } from './use-cases/list-rooms';
export { ListWeekSessions } from './use-cases/list-week-sessions';
export type { ListWeekSessionsInput } from './use-cases/list-week-sessions';
export { GenerateSessions } from './use-cases/generate-sessions';
export type { GenerateSessionsInput } from './use-cases/generate-sessions';
export { GenerateAndPersistSessions } from './use-cases/generate-and-persist-sessions';
export type { GenerateAndPersistSessionsInput } from './use-cases/generate-and-persist-sessions';
export { CreateWeeklyRecurringSession } from './use-cases/create-weekly-recurring-session';
export type { CreateWeeklyRecurringSessionInput } from './use-cases/create-weekly-recurring-session';
export { UpdateWeeklyRecurringSession } from './use-cases/update-weekly-recurring-session';
export type { UpdateWeeklyRecurringSessionInput } from './use-cases/update-weekly-recurring-session';
export { CancelWeeklyRecurringSession } from './use-cases/cancel-weekly-recurring-session';
export type { CancelWeeklyRecurringSessionInput } from './use-cases/cancel-weekly-recurring-session';
export { UpdateRoom } from './use-cases/update-room';
export type { UpdateRoomInput } from './use-cases/update-room';
export { RestoreRoom } from './use-cases/restore-room';
export type { RestoreRoomInput } from './use-cases/restore-room';
export { CreateTeacher } from './use-cases/create-teacher';
export type { CreateTeacherInput } from './use-cases/create-teacher';
export { ListTeachers } from './use-cases/list-teachers';
export type { ListTeachersInput, TeacherScope } from './use-cases/list-teachers';
export { GetTeacher } from './use-cases/get-teacher';
export type { GetTeacherInput } from './use-cases/get-teacher';
export { UpdateTeacher } from './use-cases/update-teacher';
export type { UpdateTeacherInput } from './use-cases/update-teacher';
export { ArchiveTeacher } from './use-cases/archive-teacher';
export type { ArchiveTeacherInput } from './use-cases/archive-teacher';
export { RestoreTeacher } from './use-cases/restore-teacher';
export type { RestoreTeacherInput } from './use-cases/restore-teacher';
export { CreateHoliday } from './use-cases/create-holiday';
export type { CreateHolidayInput } from './use-cases/create-holiday';
export { ListHolidays } from './use-cases/list-holidays';
export type { ListHolidaysInput, HolidayScope } from './use-cases/list-holidays';
export { UpdateHoliday } from './use-cases/update-holiday';
export type { UpdateHolidayInput } from './use-cases/update-holiday';
export { ArchiveHoliday } from './use-cases/archive-holiday';
export type { ArchiveHolidayInput } from './use-cases/archive-holiday';
export { RestoreHoliday } from './use-cases/restore-holiday';
export type { RestoreHolidayInput } from './use-cases/restore-holiday';
export { GetCenterProfile } from './use-cases/get-center-profile';
export { SaveCenterProfile } from './use-cases/save-center-profile';
export type { SaveCenterProfileInput } from './use-cases/save-center-profile';
export { StoreCenterLogo } from './use-cases/store-center-logo';
export type { StoreCenterLogoInput } from './use-cases/store-center-logo';
export { ReadCenterLogo } from './use-cases/read-center-logo';
export type { ReadCenterLogoInput } from './use-cases/read-center-logo';
// Backup & restore (SOU-102)
export { CreateBackup } from './use-cases/create-backup';
export type { CreateBackupInput } from './use-cases/create-backup';
export { GetBackupConfig } from './use-cases/get-backup-config';
export { SaveBackupConfig } from './use-cases/save-backup-config';
export type { SaveBackupConfigInput } from './use-cases/save-backup-config';
export { RestoreBackup } from './use-cases/restore-backup';
export type {
  RestoreBackupInput,
  RestoreBackupOutcome,
  RestoreBackupResult,
} from './use-cases/restore-backup';
export { RunScheduledBackup } from './use-cases/run-scheduled-backup';
export type { RunScheduledBackupInput } from './use-cases/run-scheduled-backup';
export { SaveCenterHours } from './use-cases/save-center-hours';
export type { SaveCenterHoursInput } from './use-cases/save-center-hours';
export { GetCenterHours } from './use-cases/get-center-hours';
export type { GetCenterHoursInput } from './use-cases/get-center-hours';
export { CreateAdminAccount } from './use-cases/create-admin-account';
export type { CreateAdminAccountInput } from './use-cases/create-admin-account';
export { VerifyAdminPassword } from './use-cases/verify-admin-password';
export type { VerifyAdminPasswordInput } from './use-cases/verify-admin-password';
export { ChangeAdminPassword } from './use-cases/change-admin-password';
export type { ChangeAdminPasswordInput } from './use-cases/change-admin-password';
export { AttemptLogin } from './use-cases/attempt-login';
export type { LoginResult, CredentialVerifier } from './use-cases/attempt-login';

// Formula CRUD use cases (SOU-62).
export { CreateFormula } from './use-cases/create-formula';
export type { CreateFormulaInput } from './use-cases/create-formula';
export { UpdateFormula } from './use-cases/update-formula';
export type { UpdateFormulaInput } from './use-cases/update-formula';
export { GetFormula } from './use-cases/get-formula';
export type { GetFormulaInput } from './use-cases/get-formula';
export { ListFormulas } from './use-cases/list-formulas';
export type { ListFormulasInput, FormulaScope } from './use-cases/list-formulas';
export { CloneFormula } from './use-cases/clone-formula';
export type { CloneFormulaInput } from './use-cases/clone-formula';
export { DeactivateFormula } from './use-cases/deactivate-formula';
export type { DeactivateFormulaInput } from './use-cases/deactivate-formula';
