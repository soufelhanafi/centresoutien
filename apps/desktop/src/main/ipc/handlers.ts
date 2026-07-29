import type {
  PlanId,
  CreateSubject,
  CreateAdminAccount,
  VerifyAdminPassword,
  SaveCenterHours,
  GetCenterHours,
  CenterHours,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

/** Only the surface each handler needs — a stub satisfies it in tests. */
export type CreateSubjectUseCase = Pick<CreateSubject, 'execute'>;
export type CreateAdminAccountUseCase = Pick<CreateAdminAccount, 'execute'>;
export type VerifyAdminPasswordUseCase = Pick<VerifyAdminPassword, 'execute'>;
export type SaveCenterHoursUseCase = Pick<SaveCenterHours, 'execute'>;
export type GetCenterHoursUseCase = Pick<GetCenterHours, 'execute'>;

/** Answers first-run detection: is any admin account present? */
export type AdminExists = () => Promise<boolean>;

/** Envelope context stamped on writes: which center, device, and user. */
export type EnvelopeContext = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/** Strip the envelope: the renderer only needs the editable weekday fields. */
function toWeekView(week: readonly CenterHours[]) {
  return week.map((hours) => ({
    dayOfWeek: hours.dayOfWeek,
    open: hours.open,
    close: hours.close,
  }));
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
  saveCenterHours: SaveCenterHoursUseCase;
  getCenterHours: GetCenterHoursUseCase;
  envelopeContext: () => EnvelopeContext;
  adminExists: AdminExists;
  createAdminAccount: CreateAdminAccountUseCase;
  verifyAdminPassword: VerifyAdminPasswordUseCase;
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
      const subject = await deps.createSubject.execute({ ...request, ...deps.envelopeContext() });
      return { id: subject.id };
    },
    'centerHours.get': async () => {
      const week = await deps.getCenterHours.execute({
        centerCode: deps.envelopeContext().centerCode,
      });
      return { week: toWeekView(week) };
    },
    'centerHours.save': async (request) => {
      const week = await deps.saveCenterHours.execute({ ...deps.envelopeContext(), week: request });
      return { week: toWeekView(week) };
    },
    'admin.exists': async () => ({ exists: await deps.adminExists() }),
    'admin.create': async (request) => {
      const account = await deps.createAdminAccount.execute(request);
      return { id: account.id };
    },
    'admin.verify': async (request) => ({
      valid: await deps.verifyAdminPassword.execute(request),
    }),
  };
}
