/**
 * @centresoutien/domain — the portable core.
 *
 * Zero platform dependencies: no React, no Electron, no SQLite, no Node builtins.
 * Compiled with `lib: ["ES2022"]` (no DOM) and zero workspace dependencies.
 */
export const DOMAIN_PACKAGE = '@centresoutien/domain' as const;

// Value objects
export type { Brand } from './value-objects/brand';
export type { CenterCode, DeviceId, UserId } from './value-objects/ids';
export { ULID_REGEX, isUlid, hasIdPrefix } from './value-objects/ids';
export type { TimeOfDay } from './value-objects/time-of-day';
export { TIME_OF_DAY_REGEX, isTimeOfDay, toMinutes } from './value-objects/time-of-day';
export type { WeekdayIndex } from './value-objects/weekday';
export { WEEKDAYS, isWeekdayIndex } from './value-objects/weekday';

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

// Repository ports
export type { SoftDeletableRepository } from './repositories/soft-deletable';

// Plans & gating
export type { PlanId, FeatureFlag, PlanLimits, Plan } from './plans/plans';
export { PLANS } from './plans/plans';
export { PlanPolicy } from './plans/plan-policy';
export { DomainError, PlanFeatureUnavailableError, PlanLimitExceededError } from './errors/plan-errors';
export { AdminAccountAlreadyExistsError } from './errors/auth-errors';
export { SessionOutsideCenterHoursError } from './errors/scheduling-errors';
export type { OutsideCenterHoursReason } from './errors/scheduling-errors';

// Input validation schemas (shared by forms via zodResolver and by use cases)
export { subjectInputSchema, SUBJECT_NAME_MAX } from './schemas/subject';
export type { SubjectInput } from './schemas/subject';
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

// Entities
export { SUBJECT_ID_PREFIX } from './entities/subject';
export type { Subject, SubjectId } from './entities/subject';
export { CENTER_HOURS_ID_PREFIX, isClosed } from './entities/center-hours';
export type { CenterHours, CenterHoursId } from './entities/center-hours';
export { ADMIN_ACCOUNT_ID_PREFIX } from './entities/admin-account';
export type { AdminAccount, AdminAccountId } from './entities/admin-account';

// Repository & service ports
export type { SubjectRepository } from './ports/subject-repository';
export type { CenterHoursRepository } from './ports/center-hours-repository';
export type { AdminAccountRepository } from './ports/admin-account-repository';
export type { PasswordHasher } from './ports/password-hasher';

// Policies
export { SessionConflictPolicy } from './policies/session-conflict-policy';
export type { SessionTimeCandidate } from './policies/session-conflict-policy';

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
export { SaveCenterHours } from './use-cases/save-center-hours';
export type { SaveCenterHoursInput } from './use-cases/save-center-hours';
export { GetCenterHours } from './use-cases/get-center-hours';
export type { GetCenterHoursInput } from './use-cases/get-center-hours';
export { CreateAdminAccount } from './use-cases/create-admin-account';
export type { CreateAdminAccountInput } from './use-cases/create-admin-account';
export { VerifyAdminPassword } from './use-cases/verify-admin-password';
export type { VerifyAdminPasswordInput } from './use-cases/verify-admin-password';
