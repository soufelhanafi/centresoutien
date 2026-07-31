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
export { AdminAccountAlreadyExistsError } from './errors/auth-errors';
export { StudentNotFoundError } from './errors/student-errors';
export { DuplicateParentError, ParentNotFoundError } from './errors/people-errors';
export { RoomInUseError, RoomNotFoundError } from './errors/room-errors';
export {
  SubjectInUseError,
  SubjectNotFoundError,
  DuplicateSubjectCodeError,
} from './errors/subject-errors';
export { HolidayNotFoundError } from './errors/holiday-errors';
export {
  SessionOutsideCenterHoursError,
  RoomConflictError,
  SessionOnHolidayError,
  TeacherConflictError,
  MalformedSessionTimeError,
} from './errors/scheduling-errors';
export type { OutsideCenterHoursReason, ScheduledSessionRef } from './errors/scheduling-errors';

// Input validation schemas (shared by forms via zodResolver and by use cases)
export {
  subjectInputSchema,
  SUBJECT_NAME_MAX,
  SUBJECT_CODE_MAX,
  SUBJECT_CODE_PATTERN,
} from './schemas/subject';
export type { SubjectInput } from './schemas/subject';
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
  USERNAME_MIN,
  USERNAME_MAX,
  PASSWORD_MIN,
  PASSWORD_MAX,
} from './schemas/admin-account';
export type { AdminCredentials } from './schemas/admin-account';
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
export { HOLIDAY_ID_PREFIX } from './entities/holiday';
export type { Holiday, HolidayId, HolidayKind } from './entities/holiday';
export {
  WEEKLY_RECURRING_SESSION_ID_PREFIX,
  toScheduledSessionRef,
} from './entities/weekly-recurring-session';
export type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from './entities/weekly-recurring-session';

// Value objects & policies (login throttle — SOU-27)
export { UNLOCKED_STATE } from './value-objects/lockout-state';
export type { LockoutState } from './value-objects/lockout-state';
export {
  LoginThrottlePolicy,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from './policies/login-throttle-policy';

// Repository & service ports
export type { SubjectRepository } from './ports/subject-repository';
// Subject in-use guard — its concrete adapter is the group/session/formula
// reference query, wired once those references exist.
export type { SubjectReferencePort } from './ports/subject-reference';
export type { StudentRepository } from './ports/student-repository';
export type { CenterHoursRepository } from './ports/center-hours-repository';
export type { AdminAccountRepository } from './ports/admin-account-repository';
export type { PasswordHasher } from './ports/password-hasher';
export type { LoginThrottleStore } from './ports/login-throttle-store';
export type { DeviceSessionStore } from './ports/device-session-store';
export type { CenterRepository } from './ports/center-repository';
export type { LogoStore } from './ports/logo-store';
export type { ParentRepository } from './ports/parent-repository';
export type { RoomRepository } from './ports/room-repository';
export type { HolidayRepository } from './ports/holiday-repository';
export type { WeeklyRecurringSessionRepository } from './ports/weekly-recurring-session-repository';
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
export { holidayCoversDate, holidayOn } from './policies/holiday-policy';
export type { HolidayOccurrence } from './policies/holiday-policy';
export { detectSessionConflicts } from './policies/composite-session-conflicts';
export type {
  ConflictSeverity,
  SessionConflict,
  CompositeSessionCandidate,
  ConflictCheckContext,
} from './policies/composite-session-conflicts';
export { buildStudentNaturalKey } from './policies/natural-key';

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
export { ArchiveRoom } from './use-cases/archive-room';
export type { ArchiveRoomInput } from './use-cases/archive-room';
export { ListRooms } from './use-cases/list-rooms';
export type { ListRoomsInput, RoomScope } from './use-cases/list-rooms';
export { ListWeekSessions } from './use-cases/list-week-sessions';
export type { ListWeekSessionsInput } from './use-cases/list-week-sessions';
export { UpdateRoom } from './use-cases/update-room';
export type { UpdateRoomInput } from './use-cases/update-room';
export { RestoreRoom } from './use-cases/restore-room';
export type { RestoreRoomInput } from './use-cases/restore-room';
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
export { SaveCenterHours } from './use-cases/save-center-hours';
export type { SaveCenterHoursInput } from './use-cases/save-center-hours';
export { GetCenterHours } from './use-cases/get-center-hours';
export type { GetCenterHoursInput } from './use-cases/get-center-hours';
export { CreateAdminAccount } from './use-cases/create-admin-account';
export type { CreateAdminAccountInput } from './use-cases/create-admin-account';
export { VerifyAdminPassword } from './use-cases/verify-admin-password';
export type { VerifyAdminPasswordInput } from './use-cases/verify-admin-password';
export { AttemptLogin } from './use-cases/attempt-login';
export type { LoginResult, CredentialVerifier } from './use-cases/attempt-login';
