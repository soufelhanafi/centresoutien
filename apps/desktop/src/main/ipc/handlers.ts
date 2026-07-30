import type {
  PlanId,
  CreateSubject,
  CreateStudent,
  ListStudents,
  GetStudent,
  UpdateStudent,
  ArchiveStudent,
  Student,
  StudentId,
  CreateAdminAccount,
  VerifyAdminPassword,
  SaveCenterHours,
  GetCenterHours,
  CenterHours,
  AttemptLogin,
  DeviceSessionService,
  GetCenterProfile,
  SaveCenterProfile,
  StoreCenterLogo,
  ReadCenterLogo,
  Center,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

/** Only the surface each handler needs — a stub satisfies it in tests. */
export type CreateSubjectUseCase = Pick<CreateSubject, 'execute'>;
export type CreateStudentUseCase = Pick<CreateStudent, 'execute'>;
export type ListStudentsUseCase = Pick<ListStudents, 'execute'>;
export type GetStudentUseCase = Pick<GetStudent, 'execute'>;
export type UpdateStudentUseCase = Pick<UpdateStudent, 'execute'>;
export type ArchiveStudentUseCase = Pick<ArchiveStudent, 'execute'>;
export type CreateAdminAccountUseCase = Pick<CreateAdminAccount, 'execute'>;
export type VerifyAdminPasswordUseCase = Pick<VerifyAdminPassword, 'execute'>;
export type SaveCenterHoursUseCase = Pick<SaveCenterHours, 'execute'>;
export type GetCenterHoursUseCase = Pick<GetCenterHours, 'execute'>;
export type AttemptLoginUseCase = Pick<AttemptLogin, 'execute'>;
export type DeviceSessions = Pick<DeviceSessionService, 'isAuthenticated' | 'forget'>;
export type GetCenterProfileUseCase = Pick<GetCenterProfile, 'execute'>;
export type SaveCenterProfileUseCase = Pick<SaveCenterProfile, 'execute'>;
export type StoreCenterLogoUseCase = Pick<StoreCenterLogo, 'execute'>;
export type ReadCenterLogoUseCase = Pick<ReadCenterLogo, 'execute'>;

/** Answers first-run detection: is any admin account present? */
export type AdminExists = () => Promise<boolean>;

/** Envelope context stamped on writes: which center, device, and user. */
export type EnvelopeContext = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/** Center writes also need the plan to seed the row on first creation. */
export type CenterContext = EnvelopeContext & { seedPlan: PlanId };

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

/** Project a Student to its boundary DTO: envelope stripped, dates serialized,
 *  `archived` derived from the soft-delete tombstone. */
function toStudentView(student: Student) {
  return {
    id: student.id,
    name: { fr: student.name.fr, ar: student.name.ar },
    birthDate: student.birthDate,
    level: student.level,
    school: student.school,
    notes: student.notes,
    guardianIds: [...student.guardianIds],
    archived: student.deletedAt !== null,
    createdAt: student.createdAt.toISOString(),
  };
}

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
  createStudent: CreateStudentUseCase;
  listStudents: ListStudentsUseCase;
  getStudent: GetStudentUseCase;
  updateStudent: UpdateStudentUseCase;
  archiveStudent: ArchiveStudentUseCase;
  saveCenterHours: SaveCenterHoursUseCase;
  getCenterHours: GetCenterHoursUseCase;
  envelopeContext: () => EnvelopeContext;
  adminExists: AdminExists;
  createAdminAccount: CreateAdminAccountUseCase;
  verifyAdminPassword: VerifyAdminPasswordUseCase;
  attemptLogin: AttemptLoginUseCase;
  deviceSessions: DeviceSessions;
  getCenterProfile: GetCenterProfileUseCase;
  saveCenterProfile: SaveCenterProfileUseCase;
  storeCenterLogo: StoreCenterLogoUseCase;
  readCenterLogo: ReadCenterLogoUseCase;
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
      const subject = await deps.createSubject.execute({ ...request, ...deps.envelopeContext() });
      return { id: subject.id };
    },
    'student.create': async (request) => {
      const student = await deps.createStudent.execute({ ...request, ...deps.envelopeContext() });
      return { id: student.id };
    },
    'student.list': async (request) => {
      const students = await deps.listStudents.execute({
        centerCode: deps.envelopeContext().centerCode,
        search: request.search,
      });
      return { students: students.map(toStudentView) };
    },
    'student.get': async (request) => {
      const student = await deps.getStudent.execute({ id: request.id as StudentId });
      return { student: student ? toStudentView(student) : null };
    },
    'student.update': async (request) => {
      const { id, ...fields } = request;
      const student = await deps.updateStudent.execute({
        ...fields,
        id: id as StudentId,
        updatedBy: deps.envelopeContext().updatedBy,
      });
      return { student: toStudentView(student) };
    },
    'student.archive': async (request) => {
      await deps.archiveStudent.execute({ id: request.id as StudentId });
      return { ok: true };
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
    'center.logoBytes': async (request) => {
      const bytes = await deps.readCenterLogo.execute(request);
      return { bytes };
    },
  };
}
