import type {
  PlanId,
  CreateSubject,
  CreateAdminAccount,
  VerifyAdminPassword,
  AttemptLogin,
  DeviceSessionService,
  GetCenterProfile,
  SaveCenterProfile,
  StoreCenterLogo,
  Center,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

/** Only the surface each handler needs — a stub satisfies it in tests. */
export type CreateSubjectUseCase = Pick<CreateSubject, 'execute'>;
export type CreateAdminAccountUseCase = Pick<CreateAdminAccount, 'execute'>;
export type VerifyAdminPasswordUseCase = Pick<VerifyAdminPassword, 'execute'>;
export type AttemptLoginUseCase = Pick<AttemptLogin, 'execute'>;
export type DeviceSessions = Pick<DeviceSessionService, 'isAuthenticated' | 'forget'>;
export type GetCenterProfileUseCase = Pick<GetCenterProfile, 'execute'>;
export type SaveCenterProfileUseCase = Pick<SaveCenterProfile, 'execute'>;
export type StoreCenterLogoUseCase = Pick<StoreCenterLogo, 'execute'>;

/** Answers first-run detection: is any admin account present? */
export type AdminExists = () => Promise<boolean>;

/** Envelope context stamped on writes: which center, device, and user. */
export type SubjectContext = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/** Center writes also need the plan to seed the row on first creation. */
export type CenterContext = SubjectContext & { seedPlan: PlanId };

/** Project the domain entity down to the boundary DTO — envelope dates stay in main. */
function toCenterDto(center: Center) {
  return {
    name: center.name,
    address: center.address,
    phone: center.phone,
    email: center.email,
    logoPath: center.logoPath,
    plan: center.plan,
  };
}

/**
 * IPC handler implementations. Dependencies (app version, active plan, wired use
 * cases) are injected so handlers stay pure and testable without Electron. Each
 * handler delegates to a pre-wired domain use case; it adds no business logic.
 */
export type HandlerDeps = {
  appVersion: () => string;
  activePlanId: () => PlanId;
  createSubject: CreateSubjectUseCase;
  subjectContext: () => SubjectContext;
  adminExists: AdminExists;
  createAdminAccount: CreateAdminAccountUseCase;
  verifyAdminPassword: VerifyAdminPasswordUseCase;
  attemptLogin: AttemptLoginUseCase;
  deviceSessions: DeviceSessions;
  getCenterProfile: GetCenterProfileUseCase;
  saveCenterProfile: SaveCenterProfileUseCase;
  storeCenterLogo: StoreCenterLogoUseCase;
  centerContext: () => CenterContext;
};

export function createHandlers(deps: HandlerDeps): IpcHandlers {
  return {
    'app.ping': (request) => ({
      reply: `pong: ${request.message}`,
      appVersion: deps.appVersion(),
    }),
    'plan.get': () => ({
      planId: deps.activePlanId(),
    }),
    'subject.create': async (request) => {
      const subject = await deps.createSubject.execute({ ...request, ...deps.subjectContext() });
      return { id: subject.id };
    },
    'admin.exists': async () => ({ exists: await deps.adminExists() }),
    'admin.create': async (request) => {
      const account = await deps.createAdminAccount.execute(request);
      return { id: account.id };
    },
    'admin.verify': async (request) => ({
      valid: await deps.verifyAdminPassword.execute(request),
    }),
    'auth.login': async (request) => {
      const result = await deps.attemptLogin.execute(request);
      switch (result.outcome) {
        case 'success':
          return { outcome: 'success' };
        case 'invalid-credentials':
          return { outcome: 'invalid-credentials', remainingAttempts: result.remainingAttempts };
        case 'locked-out':
          return { outcome: 'locked-out', lockedUntilMs: result.lockedUntil };
      }
    },
    'auth.session': async () => ({ authenticated: await deps.deviceSessions.isAuthenticated() }),
    'auth.logout': async () => {
      await deps.deviceSessions.forget();
      return { ok: true };
    },
    'center.get': async () => {
      const center = await deps.getCenterProfile.execute();
      return { center: center ? toCenterDto(center) : null };
    },
    'center.save': async (request) => {
      const center = await deps.saveCenterProfile.execute({ ...request, ...deps.centerContext() });
      return { center: toCenterDto(center) };
    },
    'center.saveLogo': async (request) => {
      const path = await deps.storeCenterLogo.execute(request);
      return { path };
    },
    // SOU-28 (frontend fix): the renderer re-displays a persisted logo via this
    // channel. Reading bytes back needs a `LogoStore.read(path)` port method +
    // use case that the domain-backend agent still owns — until it lands, this
    // returns `null` so the field falls back to the placeholder. Swap in the
    // real `deps.readCenterLogo.execute(request)` when that contract merges.
    'center.logoBytes': async () => ({ bytes: null }),
  };
}
