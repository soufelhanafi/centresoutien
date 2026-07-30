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
export type { PhoneNumber, PhoneRegion } from './value-objects/phone-number';
export { normalizePhone, InvalidPhoneNumberError } from './value-objects/phone-number';

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
export { loginInputSchema } from './schemas/login';
export type { LoginInput } from './schemas/login';
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
export type { AdminAccountRepository } from './ports/admin-account-repository';
export type { PasswordHasher } from './ports/password-hasher';
export type { LoginThrottleStore } from './ports/login-throttle-store';
export type { DeviceSessionStore } from './ports/device-session-store';
export type { CenterRepository } from './ports/center-repository';
export type { LogoStore } from './ports/logo-store';

// Domain services
export { DeviceSessionService } from './services/device-session-service';

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
export { GetCenterProfile } from './use-cases/get-center-profile';
export { SaveCenterProfile } from './use-cases/save-center-profile';
export type { SaveCenterProfileInput } from './use-cases/save-center-profile';
export { StoreCenterLogo } from './use-cases/store-center-logo';
export type { StoreCenterLogoInput } from './use-cases/store-center-logo';
export { ReadCenterLogo } from './use-cases/read-center-logo';
export type { ReadCenterLogoInput } from './use-cases/read-center-logo';
export { CreateAdminAccount } from './use-cases/create-admin-account';
export type { CreateAdminAccountInput } from './use-cases/create-admin-account';
export { VerifyAdminPassword } from './use-cases/verify-admin-password';
export type { VerifyAdminPasswordInput } from './use-cases/verify-admin-password';
export { AttemptLogin } from './use-cases/attempt-login';
export type { LoginResult, CredentialVerifier } from './use-cases/attempt-login';
