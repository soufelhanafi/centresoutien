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
  CreateParent,
  ListParents,
  GetParent,
  UpdateParent,
  ArchiveParent,
  ListParentChildren,
  Parent,
  ParentId,
  CreateRoom,
  ListRooms,
  UpdateRoom,
  ArchiveRoom,
  RestoreRoom,
  Room,
  RoomId,
  CreateGroup,
  ListGroups,
  UpdateGroup,
  ArchiveGroup,
  RestoreGroup,
  Group,
  GroupId,
  CreateTeacher,
  ListTeachers,
  GetTeacher,
  UpdateTeacher,
  ArchiveTeacher,
  Teacher,
  TeacherId,
  CreateHoliday,
  ListHolidays,
  UpdateHoliday,
  ArchiveHoliday,
  RestoreHoliday,
  Holiday,
  HolidayId,
  ListWeekSessions,
  WeeklyRecurringSession,
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
import {
  StudentNotFoundError,
  ParentNotFoundError,
  RoomNotFoundError,
  GroupNotFoundError,
  TeacherNotFoundError,
  HolidayNotFoundError,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

/** Only the surface each handler needs — a stub satisfies it in tests. */
export type CreateSubjectUseCase = Pick<CreateSubject, 'execute'>;
export type CreateStudentUseCase = Pick<CreateStudent, 'execute'>;
export type ListStudentsUseCase = Pick<ListStudents, 'execute'>;
export type GetStudentUseCase = Pick<GetStudent, 'execute'>;
export type UpdateStudentUseCase = Pick<UpdateStudent, 'execute'>;
export type ArchiveStudentUseCase = Pick<ArchiveStudent, 'execute'>;
export type CreateParentUseCase = Pick<CreateParent, 'execute'>;
export type ListParentsUseCase = Pick<ListParents, 'execute'>;
export type GetParentUseCase = Pick<GetParent, 'execute'>;
export type UpdateParentUseCase = Pick<UpdateParent, 'execute'>;
export type ArchiveParentUseCase = Pick<ArchiveParent, 'execute'>;
export type ListParentChildrenUseCase = Pick<ListParentChildren, 'execute'>;
export type CreateRoomUseCase = Pick<CreateRoom, 'execute'>;
export type ListRoomsUseCase = Pick<ListRooms, 'execute'>;
export type UpdateRoomUseCase = Pick<UpdateRoom, 'execute'>;
export type ArchiveRoomUseCase = Pick<ArchiveRoom, 'execute'>;
export type RestoreRoomUseCase = Pick<RestoreRoom, 'execute'>;
export type CreateGroupUseCase = Pick<CreateGroup, 'execute'>;
export type ListGroupsUseCase = Pick<ListGroups, 'execute'>;
export type UpdateGroupUseCase = Pick<UpdateGroup, 'execute'>;
export type ArchiveGroupUseCase = Pick<ArchiveGroup, 'execute'>;
export type RestoreGroupUseCase = Pick<RestoreGroup, 'execute'>;
export type CreateTeacherUseCase = Pick<CreateTeacher, 'execute'>;
export type ListTeachersUseCase = Pick<ListTeachers, 'execute'>;
export type GetTeacherUseCase = Pick<GetTeacher, 'execute'>;
export type UpdateTeacherUseCase = Pick<UpdateTeacher, 'execute'>;
export type ArchiveTeacherUseCase = Pick<ArchiveTeacher, 'execute'>;
export type CreateHolidayUseCase = Pick<CreateHoliday, 'execute'>;
export type ListHolidaysUseCase = Pick<ListHolidays, 'execute'>;
export type UpdateHolidayUseCase = Pick<UpdateHoliday, 'execute'>;
export type ArchiveHolidayUseCase = Pick<ArchiveHoliday, 'execute'>;
export type RestoreHolidayUseCase = Pick<RestoreHoliday, 'execute'>;
export type ListWeekSessionsUseCase = Pick<ListWeekSessions, 'execute'>;
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

/** Project a Parent to its boundary DTO: envelope stripped, dates serialized,
 *  `archived` derived from the soft-delete tombstone. */
function toParentView(parent: Parent) {
  return {
    id: parent.id,
    name: parent.name,
    phone: parent.phone,
    email: parent.email,
    relation: parent.relation,
    whatsappOptIn: parent.whatsappOptIn,
    archived: parent.deletedAt !== null,
    createdAt: parent.createdAt.toISOString(),
  };
}

/** Project a Room to its boundary DTO: envelope stripped, dates serialized,
 *  `archived` derived from the soft-delete tombstone. */
function toRoomView(room: Room) {
  return {
    id: room.id,
    name: room.name,
    capacity: room.capacity,
    archived: room.deletedAt !== null,
    createdAt: room.createdAt.toISOString(),
  };
}

/** Project a Group to its boundary DTO: envelope stripped, dates serialized,
 *  `archived` derived from the soft-delete tombstone. `active` (a not-yet-read
 *  domain flag) never crosses the boundary. */
function toGroupView(group: Group) {
  return {
    id: group.id,
    subjectId: group.subjectId,
    teacherId: group.teacherId,
    roomId: group.roomId,
    level: group.level,
    capacity: group.capacity,
    kind: group.kind,
    archived: group.deletedAt !== null,
    createdAt: group.createdAt.toISOString(),
  };
}

/** Project a Teacher to its boundary DTO: envelope stripped, dates serialized,
 *  `archived` derived from the soft-delete tombstone. */
function toTeacherView(teacher: Teacher) {
  return {
    id: teacher.id,
    name: { fr: teacher.name.fr, ar: teacher.name.ar },
    cin: teacher.cin,
    phone: teacher.phone,
    email: teacher.email,
    subjectIds: [...teacher.subjectIds],
    archived: teacher.deletedAt !== null,
    createdAt: teacher.createdAt.toISOString(),
  };
}

/** Project a Holiday to its boundary DTO: envelope stripped, dates serialized,
 *  `archived` derived from the soft-delete tombstone. `affectsInvoicing` (an
 *  always-false invariant) never crosses the boundary. */
function toHolidayView(holiday: Holiday) {
  return {
    id: holiday.id,
    name: { fr: holiday.name.fr, ar: holiday.name.ar },
    kind: holiday.kind,
    startDate: holiday.startDate,
    endDate: holiday.endDate,
    archived: holiday.deletedAt !== null,
    createdAt: holiday.createdAt.toISOString(),
  };
}

/** Project a weekly recurring session to its boundary DTO: envelope stripped, the
 *  branded `TimeOfDay`/id values widened to plain strings for the wire. */
function toWeeklySessionView(session: WeeklyRecurringSession) {
  return {
    id: session.id,
    roomId: session.roomId,
    teacherId: session.teacherId,
    dayOfWeek: session.dayOfWeek,
    start: session.start,
    end: session.end,
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
  createParent: CreateParentUseCase;
  listParents: ListParentsUseCase;
  getParent: GetParentUseCase;
  updateParent: UpdateParentUseCase;
  archiveParent: ArchiveParentUseCase;
  listParentChildren: ListParentChildrenUseCase;
  createRoom: CreateRoomUseCase;
  listRooms: ListRoomsUseCase;
  updateRoom: UpdateRoomUseCase;
  archiveRoom: ArchiveRoomUseCase;
  restoreRoom: RestoreRoomUseCase;
  createGroup: CreateGroupUseCase;
  listGroups: ListGroupsUseCase;
  updateGroup: UpdateGroupUseCase;
  archiveGroup: ArchiveGroupUseCase;
  restoreGroup: RestoreGroupUseCase;
  createTeacher: CreateTeacherUseCase;
  listTeachers: ListTeachersUseCase;
  getTeacher: GetTeacherUseCase;
  updateTeacher: UpdateTeacherUseCase;
  archiveTeacher: ArchiveTeacherUseCase;
  createHoliday: CreateHolidayUseCase;
  listHolidays: ListHolidaysUseCase;
  updateHoliday: UpdateHolidayUseCase;
  archiveHoliday: ArchiveHolidayUseCase;
  restoreHoliday: RestoreHolidayUseCase;
  listWeekSessions: ListWeekSessionsUseCase;
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
      const student = await deps.getStudent.execute({
        centerCode: deps.envelopeContext().centerCode,
        id: request.id as StudentId,
      });
      return { student: student ? toStudentView(student) : null };
    },
    'student.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const student = await deps.updateStudent.execute({
        ...fields,
        centerCode,
        id: id as StudentId,
        updatedBy,
      });
      return { student: toStudentView(student) };
    },
    'student.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveStudent.execute({ centerCode, id: request.id as StudentId, updatedBy });
      } catch (error) {
        // Archiving is idempotent at the boundary: an already-archived or
        // unknown student means the desired end-state (row inactive) already
        // holds, so report success instead of surfacing a generic error toast.
        // The domain use case still throws so other callers/tests stay strict.
        if (!(error instanceof StudentNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'parent.create': async (request) => {
      const parent = await deps.createParent.execute({ ...request, ...deps.envelopeContext() });
      return { id: parent.id };
    },
    'parent.list': async (request) => {
      const parents = await deps.listParents.execute({
        centerCode: deps.envelopeContext().centerCode,
        search: request.search,
      });
      return { parents: parents.map(toParentView) };
    },
    'parent.get': async (request) => {
      const parent = await deps.getParent.execute({
        centerCode: deps.envelopeContext().centerCode,
        id: request.id as ParentId,
      });
      return { parent: parent ? toParentView(parent) : null };
    },
    'parent.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const parent = await deps.updateParent.execute({
        ...fields,
        centerCode,
        id: id as ParentId,
        updatedBy,
      });
      return { parent: toParentView(parent) };
    },
    'parent.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveParent.execute({ centerCode, id: request.id as ParentId, updatedBy });
      } catch (error) {
        // Archiving is idempotent at the boundary: an already-archived or unknown
        // guardian means the desired end-state (row inactive) already holds, so
        // report success instead of a generic error toast. The domain use case
        // still throws so other callers/tests stay strict. Mirrors student.archive.
        if (!(error instanceof ParentNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'parent.children': async (request) => {
      const students = await deps.listParentChildren.execute({
        centerCode: deps.envelopeContext().centerCode,
        parentId: request.id as ParentId,
      });
      return { students: students.map(toStudentView) };
    },
    'room.create': async (request) => {
      const room = await deps.createRoom.execute({ ...request, ...deps.envelopeContext() });
      return { id: room.id };
    },
    'room.list': async (request) => {
      const rooms = await deps.listRooms.execute({
        centerCode: deps.envelopeContext().centerCode,
        scope: request.scope,
      });
      return { rooms: rooms.map(toRoomView) };
    },
    'room.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const room = await deps.updateRoom.execute({
        ...fields,
        centerCode,
        id: id as RoomId,
        updatedBy,
      });
      return { room: toRoomView(room) };
    },
    'room.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveRoom.execute({ centerCode, roomId: request.id as RoomId, updatedBy });
      } catch (error) {
        // Archiving is idempotent at the boundary: an already-archived or unknown
        // room means the desired end-state (row inactive) already holds, so report
        // success instead of a generic error toast. The domain use case still
        // throws so other callers/tests stay strict. (RoomInUseError is a real
        // failure and is NOT swallowed — the UI must tell the user to reassign
        // the room's sessions first.)
        if (!(error instanceof RoomNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'room.restore': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      const room = await deps.restoreRoom.execute({ centerCode, roomId: request.id as RoomId, updatedBy });
      return { room: toRoomView(room) };
    },
    'group.create': async (request) => {
      const group = await deps.createGroup.execute({ ...request, ...deps.envelopeContext() });
      return { id: group.id };
    },
    'group.list': async (request) => {
      const groups = await deps.listGroups.execute({
        centerCode: deps.envelopeContext().centerCode,
        scope: request.scope,
      });
      return { groups: groups.map(toGroupView) };
    },
    'group.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const group = await deps.updateGroup.execute({
        ...fields,
        centerCode,
        id: id as GroupId,
        updatedBy,
      });
      return { group: toGroupView(group) };
    },
    'group.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveGroup.execute({ centerCode, groupId: request.id as GroupId, updatedBy });
      } catch (error) {
        // Archiving is idempotent at the boundary: an already-archived or unknown
        // group means the desired end-state (row inactive) already holds, so report
        // success instead of a generic error toast. The domain use case still
        // throws so other callers/tests stay strict. Mirrors room.archive.
        if (!(error instanceof GroupNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'group.restore': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      const group = await deps.restoreGroup.execute({ centerCode, groupId: request.id as GroupId, updatedBy });
      return { group: toGroupView(group) };
    },
    'teacher.create': async (request) => {
      const teacher = await deps.createTeacher.execute({ ...request, ...deps.envelopeContext() });
      return { id: teacher.id };
    },
    'teacher.list': async (request) => {
      const teachers = await deps.listTeachers.execute({
        centerCode: deps.envelopeContext().centerCode,
        search: request.search,
      });
      return { teachers: teachers.map(toTeacherView) };
    },
    'teacher.get': async (request) => {
      const teacher = await deps.getTeacher.execute({
        centerCode: deps.envelopeContext().centerCode,
        id: request.id as TeacherId,
      });
      return { teacher: teacher ? toTeacherView(teacher) : null };
    },
    'teacher.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const teacher = await deps.updateTeacher.execute({
        ...fields,
        centerCode,
        id: id as TeacherId,
        updatedBy,
      });
      return { teacher: toTeacherView(teacher) };
    },
    'teacher.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveTeacher.execute({ centerCode, id: request.id as TeacherId, updatedBy });
      } catch (error) {
        // Archiving is idempotent at the boundary: an already-archived or unknown
        // teacher means the desired end-state (row inactive) already holds, so
        // report success instead of a generic error toast. The domain use case
        // still throws so other callers/tests stay strict. Mirrors room.archive —
        // TeacherInUseError is a real failure and is NOT swallowed (the UI must
        // tell the user to reassign the teacher's groups/rules first).
        if (!(error instanceof TeacherNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'holiday.create': async (request) => {
      const holiday = await deps.createHoliday.execute({ ...request, ...deps.envelopeContext() });
      return { id: holiday.id };
    },
    'holiday.list': async (request) => {
      const holidays = await deps.listHolidays.execute({
        centerCode: deps.envelopeContext().centerCode,
        scope: request.scope,
      });
      return { holidays: holidays.map(toHolidayView) };
    },
    'holiday.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const holiday = await deps.updateHoliday.execute({
        ...fields,
        centerCode,
        id: id as HolidayId,
        updatedBy,
      });
      return { holiday: toHolidayView(holiday) };
    },
    'holiday.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveHoliday.execute({ centerCode, holidayId: request.id as HolidayId, updatedBy });
      } catch (error) {
        // Archiving is idempotent at the boundary: an already-archived or unknown
        // holiday means the desired end-state (row inactive) already holds, so
        // report success instead of a generic error toast. The domain use case
        // still throws so other callers/tests stay strict. Mirrors room.archive.
        if (!(error instanceof HolidayNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'holiday.restore': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      const holiday = await deps.restoreHoliday.execute({
        centerCode,
        holidayId: request.id as HolidayId,
        updatedBy,
      });
      return { holiday: toHolidayView(holiday) };
    },
    'session.week': async () => {
      const sessions = await deps.listWeekSessions.execute({
        centerCode: deps.envelopeContext().centerCode,
      });
      return { sessions: sessions.map(toWeeklySessionView) };
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
