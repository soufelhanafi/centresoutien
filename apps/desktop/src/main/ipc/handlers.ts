import type {
  PlanId,
  CreateSubject,
  ArchiveSubject,
  ListSubjects,
  GetSubject,
  ListSubjectsWithUsage,
  UpdateSubject,
  Subject,
  SubjectUsage,
  SubjectId,
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
  ListGroupsWithCounts,
  GetGroupRoster,
  GroupWithCount,
  GroupRosterEntry,
  UpdateGroup,
  ArchiveGroup,
  RestoreGroup,
  Group,
  GroupId,
  CreateStudentSubscription,
  CloseStudentSubscription,
  ListStudentSubscriptions,
  StudentSubscription,
  StudentSubscriptionId,
  ListFormulas,
  Formula,
  RecordPayment,
  VoidPayment,
  GetInvoicePaymentSummary,
  Payment,
  InvoiceId,
  EnrollStudent,
  UnenrollStudent,
  EnrollmentId,
  CreateTeacher,
  ListTeachers,
  GetTeacher,
  UpdateTeacher,
  ArchiveTeacher,
  RestoreTeacher,
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
  WeeklySessionView,
  GenerateAndPersistSessions,
  CreateWeeklyRecurringSession,
  UpdateWeeklyRecurringSession,
  CancelWeeklyRecurringSession,
  Session,
  WeeklyRecurringSessionId,
  CreateAdminAccount,
  VerifyAdminPassword,
  ChangeAdminPassword,
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
  SubjectNotFoundError,
  StudentNotFoundError,
  ParentNotFoundError,
  RoomNotFoundError,
  GroupNotFoundError,
  TeacherNotFoundError,
  HolidayNotFoundError,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import type { LocalePreference } from '../infra/locale-preference-store';

/** Only the surface each handler needs — a stub satisfies it in tests. */
export type CreateSubjectUseCase = Pick<CreateSubject, 'execute'>;
export type ArchiveSubjectUseCase = Pick<ArchiveSubject, 'execute'>;
export type ListSubjectsUseCase = Pick<ListSubjects, 'execute'>;
export type GetSubjectUseCase = Pick<GetSubject, 'execute'>;
export type ListSubjectsWithUsageUseCase = Pick<ListSubjectsWithUsage, 'execute'>;
export type UpdateSubjectUseCase = Pick<UpdateSubject, 'execute'>;
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
export type ListGroupsWithCountsUseCase = Pick<ListGroupsWithCounts, 'execute'>;
export type GetGroupRosterUseCase = Pick<GetGroupRoster, 'execute'>;
export type UpdateGroupUseCase = Pick<UpdateGroup, 'execute'>;
export type ArchiveGroupUseCase = Pick<ArchiveGroup, 'execute'>;
export type RestoreGroupUseCase = Pick<RestoreGroup, 'execute'>;
export type CreateStudentSubscriptionUseCase = Pick<CreateStudentSubscription, 'execute'>;
export type CloseStudentSubscriptionUseCase = Pick<CloseStudentSubscription, 'execute'>;
export type ListStudentSubscriptionsUseCase = Pick<ListStudentSubscriptions, 'execute'>;
export type ListFormulasUseCase = Pick<ListFormulas, 'execute'>;
export type RecordPaymentUseCase = Pick<RecordPayment, 'execute'>;
export type VoidPaymentUseCase = Pick<VoidPayment, 'execute'>;
export type GetInvoicePaymentSummaryUseCase = Pick<GetInvoicePaymentSummary, 'execute'>;
export type EnrollStudentUseCase = Pick<EnrollStudent, 'execute'>;
export type UnenrollStudentUseCase = Pick<UnenrollStudent, 'execute'>;
export type CreateTeacherUseCase = Pick<CreateTeacher, 'execute'>;
export type ListTeachersUseCase = Pick<ListTeachers, 'execute'>;
export type GetTeacherUseCase = Pick<GetTeacher, 'execute'>;
export type UpdateTeacherUseCase = Pick<UpdateTeacher, 'execute'>;
export type ArchiveTeacherUseCase = Pick<ArchiveTeacher, 'execute'>;
export type RestoreTeacherUseCase = Pick<RestoreTeacher, 'execute'>;
export type CreateHolidayUseCase = Pick<CreateHoliday, 'execute'>;
export type ListHolidaysUseCase = Pick<ListHolidays, 'execute'>;
export type UpdateHolidayUseCase = Pick<UpdateHoliday, 'execute'>;
export type ArchiveHolidayUseCase = Pick<ArchiveHoliday, 'execute'>;
export type RestoreHolidayUseCase = Pick<RestoreHoliday, 'execute'>;
export type ListWeekSessionsUseCase = Pick<ListWeekSessions, 'execute'>;
export type GenerateAndPersistSessionsUseCase = Pick<GenerateAndPersistSessions, 'execute'>;
export type CreateWeeklyRecurringSessionUseCase = Pick<CreateWeeklyRecurringSession, 'execute'>;
export type UpdateWeeklyRecurringSessionUseCase = Pick<UpdateWeeklyRecurringSession, 'execute'>;
export type CancelWeeklyRecurringSessionUseCase = Pick<CancelWeeklyRecurringSession, 'execute'>;
export type CreateAdminAccountUseCase = Pick<CreateAdminAccount, 'execute'>;
export type VerifyAdminPasswordUseCase = Pick<VerifyAdminPassword, 'execute'>;
export type ChangeAdminPasswordUseCase = Pick<ChangeAdminPassword, 'execute'>;
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

/** Project a Subject to its boundary DTO (SOU-124): envelope stripped, leaving the
 *  fields name-resolution and the pickers need. `active` is the real domain flag;
 *  tombstones never reach these reads, so no `archived` is exposed. */
function toSubjectView(subject: Subject) {
  return {
    id: subject.id,
    name: { fr: subject.name.fr, ar: subject.name.ar },
    code: subject.code,
    active: subject.active,
  };
}

/** Project a subject + its in-use count to the list-with-usage DTO: the lean
 *  subject view plus `inUseCount`, the derived `canDelete`, and the named
 *  breakdown (`references`, SOU-135) the delete-blocked modal lists. */
function toSubjectUsageView(row: SubjectUsage) {
  return {
    subject: toSubjectView(row.subject),
    inUseCount: row.inUseCount,
    canDelete: row.canDelete,
    references: row.references.map((ref) => ({
      kind: ref.kind,
      id: ref.id,
      label: { fr: ref.label.fr, ar: ref.label.ar },
    })),
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

/** Project a group + its live enrollment count to the list-with-counts DTO: the
 *  lean group view plus `enrolledCount` for the fill % the list renders. */
function toGroupWithCountView(row: GroupWithCount) {
  return { ...toGroupView(row.group), enrolledCount: row.enrolledCount };
}

/** Project a roster entry to its boundary DTO: already envelope-free, branded ids
 *  widened to plain strings for the wire. */
function toRosterEntryView(entry: GroupRosterEntry) {
  return {
    enrollmentId: entry.enrollmentId,
    studentId: entry.studentId,
    name: { fr: entry.name.fr, ar: entry.name.ar },
    level: entry.level,
    startMonth: entry.startMonth,
  };
}

/** Project a StudentSubscription to its boundary DTO: envelope stripped, dates
 *  serialized, `archived` derived from the soft-delete tombstone. No status field —
 *  the renderer derives active/closed from `endMonth` against the current month. */
function toSubscriptionView(subscription: StudentSubscription) {
  return {
    id: subscription.id,
    studentId: subscription.studentId,
    formulaId: subscription.formulaId,
    kind: subscription.kind,
    subjectIds: [...subscription.subjectIds],
    startMonth: subscription.startMonth,
    endMonth: subscription.endMonth,
    archived: subscription.deletedAt !== null,
    createdAt: subscription.createdAt.toISOString(),
  };
}

/** Project a Formula to its boundary DTO: envelope and `isImmutable` stripped —
 *  tombstones never reach this read, so no `archived` is exposed either, mirroring
 *  `toSubjectView`. */
function toFormulaView(formula: Formula) {
  return {
    id: formula.id,
    name: { fr: formula.name.fr, ar: formula.name.ar },
    subjectIds: [...formula.subjectIds],
    priceMad: formula.priceMad,
    kind: formula.kind,
    active: formula.active,
  };
}

/** Project a Payment to its boundary DTO: envelope stripped, dates serialized. A
 *  `reversal` carries `reversesPaymentId`; a `payment` has it null. */
function toPaymentView(payment: Payment) {
  return {
    id: payment.id,
    invoiceId: payment.invoiceId,
    kind: payment.kind,
    amountMad: payment.amountMad,
    method: payment.method,
    paidOn: payment.paidOn,
    reversesPaymentId: payment.reversesPaymentId,
    createdAt: payment.createdAt.toISOString(),
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

/** Project an enriched weekly-session view to its boundary DTO: branded
 *  `TimeOfDay`/id values widened to plain strings for the wire; the join-derived
 *  fields (room/teacher names, subject, level, kind) pass through with their
 *  neutral-fallback nulls already resolved in the domain read model. */
function toWeeklySessionView(session: WeeklySessionView) {
  return {
    id: session.id,
    dayOfWeek: session.dayOfWeek,
    start: session.start,
    end: session.end,
    roomId: session.roomId,
    roomName: session.roomName,
    teacherId: session.teacherId,
    teacherName: session.teacherName === null ? null : { ...session.teacherName },
    groupId: session.groupId,
    subjectId: session.subjectId,
    subjectName: session.subjectName === null ? null : { ...session.subjectName },
    level: session.level,
    kind: session.kind,
  };
}

/** Project a concrete dated session to its boundary DTO: envelope stripped, the
 *  branded id / `TimeOfDay` values widened to plain strings for the wire. */
function toSessionView(session: Session) {
  return {
    id: session.id,
    recurringSessionId: session.recurringSessionId,
    roomId: session.roomId,
    teacherId: session.teacherId,
    date: session.date,
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
  archiveSubject: ArchiveSubjectUseCase;
  listSubjects: ListSubjectsUseCase;
  getSubject: GetSubjectUseCase;
  listSubjectsWithUsage: ListSubjectsWithUsageUseCase;
  updateSubject: UpdateSubjectUseCase;
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
  listGroupsWithCounts: ListGroupsWithCountsUseCase;
  getGroupRoster: GetGroupRosterUseCase;
  updateGroup: UpdateGroupUseCase;
  archiveGroup: ArchiveGroupUseCase;
  restoreGroup: RestoreGroupUseCase;
  createStudentSubscription: CreateStudentSubscriptionUseCase;
  closeStudentSubscription: CloseStudentSubscriptionUseCase;
  listStudentSubscriptions: ListStudentSubscriptionsUseCase;
  listFormulas: ListFormulasUseCase;
  recordPayment: RecordPaymentUseCase;
  voidPayment: VoidPaymentUseCase;
  getInvoicePaymentSummary: GetInvoicePaymentSummaryUseCase;
  enrollStudent: EnrollStudentUseCase;
  unenrollStudent: UnenrollStudentUseCase;
  createTeacher: CreateTeacherUseCase;
  listTeachers: ListTeachersUseCase;
  getTeacher: GetTeacherUseCase;
  updateTeacher: UpdateTeacherUseCase;
  archiveTeacher: ArchiveTeacherUseCase;
  restoreTeacher: RestoreTeacherUseCase;
  createHoliday: CreateHolidayUseCase;
  listHolidays: ListHolidaysUseCase;
  updateHoliday: UpdateHolidayUseCase;
  archiveHoliday: ArchiveHolidayUseCase;
  restoreHoliday: RestoreHolidayUseCase;
  listWeekSessions: ListWeekSessionsUseCase;
  generateSessions: GenerateAndPersistSessionsUseCase;
  createWeeklySession: CreateWeeklyRecurringSessionUseCase;
  updateWeeklySession: UpdateWeeklyRecurringSessionUseCase;
  cancelWeeklySession: CancelWeeklyRecurringSessionUseCase;
  saveCenterHours: SaveCenterHoursUseCase;
  getCenterHours: GetCenterHoursUseCase;
  envelopeContext: () => EnvelopeContext;
  adminExists: AdminExists;
  createAdminAccount: CreateAdminAccountUseCase;
  verifyAdminPassword: VerifyAdminPasswordUseCase;
  changeAdminPassword: ChangeAdminPasswordUseCase;
  attemptLogin: AttemptLoginUseCase;
  deviceSessions: DeviceSessions;
  getCenterProfile: GetCenterProfileUseCase;
  saveCenterProfile: SaveCenterProfileUseCase;
  storeCenterLogo: StoreCenterLogoUseCase;
  readCenterLogo: ReadCenterLogoUseCase;
  centerContext: () => CenterContext;
  saveLocalePreference: (locale: LocalePreference) => void;
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
    'subject.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveSubject.execute({
          centerCode,
          subjectId: request.id as SubjectId,
          updatedBy,
        });
      } catch (error) {
        // Archiving is idempotent at the boundary: an already-archived or unknown
        // subject means the desired end-state (row inactive) already holds, so
        // report success instead of a generic error toast. The domain use case
        // still throws so other callers/tests stay strict. (SubjectInUseError is a
        // real failure and is NOT swallowed — the UI must tell the user to detach
        // the subject's groups first.) Mirrors room.archive.
        if (!(error instanceof SubjectNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'subject.list': async (request) => {
      const subjects = await deps.listSubjects.execute({
        centerCode: deps.envelopeContext().centerCode,
        scope: request.scope,
      });
      return { subjects: subjects.map(toSubjectView) };
    },
    'subject.get': async (request) => {
      const subject = await deps.getSubject.execute({
        centerCode: deps.envelopeContext().centerCode,
        id: request.id as SubjectId,
      });
      return { subject: subject ? toSubjectView(subject) : null };
    },
    'subject.listWithUsage': async () => {
      const rows = await deps.listSubjectsWithUsage.execute({
        centerCode: deps.envelopeContext().centerCode,
      });
      return { subjects: rows.map(toSubjectUsageView) };
    },
    'subject.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const subject = await deps.updateSubject.execute({
        ...fields,
        centerCode,
        id: id as SubjectId,
        updatedBy,
      });
      return { subject: toSubjectView(subject) };
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
    'group.listWithCounts': async (request) => {
      const rows = await deps.listGroupsWithCounts.execute({
        centerCode: deps.envelopeContext().centerCode,
        scope: request.scope,
      });
      return { groups: rows.map(toGroupWithCountView) };
    },
    'group.roster': async (request) => {
      const roster = await deps.getGroupRoster.execute({
        centerCode: deps.envelopeContext().centerCode,
        groupId: request.groupId as GroupId,
      });
      return { roster: roster.map(toRosterEntryView) };
    },
    'subscription.create': async (request) => {
      const subscription = await deps.createStudentSubscription.execute({
        ...request,
        ...deps.envelopeContext(),
      });
      return { id: subscription.id };
    },
    'subscription.close': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      const subscription = await deps.closeStudentSubscription.execute({
        centerCode,
        subscriptionId: request.subscriptionId as StudentSubscriptionId,
        endMonth: request.endMonth,
        updatedBy,
      });
      return { subscription: toSubscriptionView(subscription) };
    },
    'subscription.list': async (request) => {
      const subscriptions = await deps.listStudentSubscriptions.execute({
        centerCode: deps.envelopeContext().centerCode,
        studentId: request.studentId as StudentId,
      });
      return { subscriptions: subscriptions.map(toSubscriptionView) };
    },
    'formula.list': async () => {
      const formulas = await deps.listFormulas.execute({
        centerCode: deps.envelopeContext().centerCode,
      });
      return { formulas: formulas.map(toFormulaView) };
    },
    'payment.record': async (request) => {
      const { payment, status } = await deps.recordPayment.execute({
        ...request,
        ...deps.envelopeContext(),
      });
      return { id: payment.id, status };
    },
    'payment.void': async (request) => {
      const reversal = await deps.voidPayment.execute({ ...request, ...deps.envelopeContext() });
      return { id: reversal.id };
    },
    'payment.summary': async (request) => {
      const summary = await deps.getInvoicePaymentSummary.execute({
        centerCode: deps.envelopeContext().centerCode,
        invoiceId: request.invoiceId as InvoiceId,
      });
      return {
        invoiceId: summary.invoiceId,
        totalMad: summary.totalMad,
        netPaidMad: summary.netPaidMad,
        outstandingMad: summary.outstandingMad,
        status: summary.status,
        payments: summary.payments.map(toPaymentView),
      };
    },
    'enrollment.create': async (request) => {
      const enrollment = await deps.enrollStudent.execute({ ...request, ...deps.envelopeContext() });
      return { id: enrollment.id };
    },
    'enrollment.unenroll': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      // Not swallowed like *.archive: the domain deliberately rejects an unknown,
      // already-unenrolled, or foreign-center id (EnrollmentNotFoundError) so a
      // stale renderer id can never silently no-op as success. The renderer maps
      // the stable `enrollment-not-found` code.
      await deps.unenrollStudent.execute({
        centerCode,
        enrollmentId: request.id as EnrollmentId,
        updatedBy,
      });
      return { ok: true };
    },
    'teacher.create': async (request) => {
      const teacher = await deps.createTeacher.execute({ ...request, ...deps.envelopeContext() });
      return { id: teacher.id };
    },
    'teacher.list': async (request) => {
      const teachers = await deps.listTeachers.execute({
        centerCode: deps.envelopeContext().centerCode,
        scope: request.scope,
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
    'teacher.restore': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      const teacher = await deps.restoreTeacher.execute({
        centerCode,
        id: request.id as TeacherId,
        updatedBy,
      });
      return { teacher: toTeacherView(teacher) };
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
    'session.generate': async (request) => {
      const { centerCode, deviceOrigin, updatedBy } = deps.envelopeContext();
      const sessions = await deps.generateSessions.execute({
        centerCode,
        recurringSessionId: request.recurringSessionId as WeeklyRecurringSessionId,
        range: { start: request.from, end: request.to },
        deviceOrigin,
        updatedBy,
      });
      return { sessions: sessions.map(toSessionView) };
    },
    'weeklySession.create': async (request) => {
      const session = await deps.createWeeklySession.execute({
        ...request,
        ...deps.envelopeContext(),
      });
      return { id: session.id };
    },
    'weeklySession.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const session = await deps.updateWeeklySession.execute({
        ...fields,
        centerCode,
        id: id as WeeklyRecurringSessionId,
        updatedBy,
      });
      return { id: session.id };
    },
    'weeklySession.delete': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      // Not swallowed like *.archive: the domain deliberately rejects an unknown,
      // already-cancelled, or foreign-center id (WeeklyRecurringSessionNotFoundError)
      // so a stale renderer id can never silently no-op as success. The renderer maps
      // the stable `weekly-recurring-session-not-found` code.
      await deps.cancelWeeklySession.execute({
        centerCode,
        id: request.id as WeeklyRecurringSessionId,
        updatedBy,
      });
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
    'admin.changePassword': async (request) => {
      await deps.changeAdminPassword.execute(request);
      return { ok: true };
    },
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
    'preferences.locale.set': (request) => {
      deps.saveLocalePreference(request.locale);
      return { ok: true };
    },
  };
}
