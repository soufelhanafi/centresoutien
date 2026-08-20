/// <reference types="vite/client" />
import type {
  PlanId,
  FeatureFlag,
  GetLicenseStatus,
  ActivateLicense,
  CreateSubject,
  ArchiveSubject,
  ListSubjects,
  GetSubject,
  ListSubjectsWithUsage,
  UpdateSubject,
  Subject,
  SubjectUsage,
  SubjectId,
  CreateNiveau,
  UpdateNiveau,
  ArchiveNiveau,
  ListNiveaux,
  GetNiveau,
  ListNiveauxWithUsage,
  Niveau,
  NiveauId,
  NiveauUsage,
  CreateFormula,
  UpdateFormula,
  GetFormula,
  ListFormulas,
  CloneFormula,
  DeactivateFormula,
  Formula,
  FormulaId,
  CreateStudent,
  ListStudents,
  GetStudent,
  UpdateStudent,
  SetStudentGuardians,
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
  ReplaceStudentSubscription,
  ListStudentSubscriptions,
  StudentSubscription,
  StudentSubscriptionId,
  RecordPayment,
  VoidPayment,
  GetInvoicePaymentSummary,
  ListRecentPayments,
  RecentPaymentView,
  GetDayTakings,
  GenerateMonthlyInvoices,
  Payment,
  InvoiceId,
  EnrollStudent,
  UnenrollStudent,
  EnrollmentId,
  CreateTeacher,
  ListTeachers,
  SearchPeople,
  GetTeacher,
  UpdateTeacher,
  ArchiveTeacher,
  RestoreTeacher,
  Teacher,
  TeacherId,
  CreateTeacherPayrollRule,
  CloseTeacherPayrollRule,
  ReplaceTeacherPayrollRule,
  ListTeacherPayrollRulesByTeacher,
  TeacherPayrollRule,
  TeacherPayrollRuleId,
  ComputeMonthlyPayrolls,
  CreateHoliday,
  ListHolidays,
  UpdateHoliday,
  ArchiveHoliday,
  RestoreHoliday,
  Holiday,
  HolidayId,
  ListWeekSessions,
  GenerateAndPersistSessions,
  UndoGenerationBatch,
  AuditSessionsOutsideEffectiveHours,
  SessionId,
  CancelSession,
  CreateWeeklyRecurringSession,
  UpdateWeeklyRecurringSession,
  CancelWeeklyRecurringSession,
  PreviewGeneratedSchedule,
  CommitGeneratedSchedule,
  SessionGeneratorConfig,
  SessionGeneratorScope,
  GroupScheduleProposal,
  CommitGroupProposal,
  GeneratedScheduleConflict,
  CommittedGeneratedTemplate,
  WeekdayIndex,
  TimeOfDay,
  RecordSessionAttendance,
  AttendanceRecord,
  Session,
  WeeklyRecurringSessionId,
  GenerationBatchId,
  CreateAdminAccount,
  CreateUser,
  RedeemSetupCode,
  ChangeAdminPassword,
  SaveCenterHours,
  GetCenterHours,
  CenterHours,
  SaveCenterHoursOverride,
  GetCenterHoursOverrides,
  GetActiveCenterHoursOverride,
  ArchiveCenterHoursOverride,
  CenterHoursOverride,
  CenterHoursOverrideId,
  AttemptLogin,
  GenerateRecoveryCodes,
  VerifyRecoveryCode,
  ResetPasswordWithRecoveryCode,
  SetSecurityQuestions,
  VerifySecurityAnswers,
  RequestPasswordResetViaSecurityQuestions,
  DeviceSessionService,
  GetCenterProfile,
  SaveCenterProfile,
  StoreCenterLogo,
  ReadCenterLogo,
  Center,
  CenterCode,
  DeviceId,
  UserId,
  GetStudentAttendanceReport,
  GetGroupAttendanceSheet,
} from '@centresoutien/domain';
import {
  SubjectNotFoundError,
  StudentNotFoundError,
  ParentNotFoundError,
  RoomNotFoundError,
  GroupNotFoundError,
  TeacherNotFoundError,
  HolidayNotFoundError,
  CenterHoursOverrideNotFoundError,
  NiveauNotFoundError,
  NotAuthenticatedError,
  SECURITY_QUESTION_KEYS,
} from '@centresoutien/domain';
import type { RegisterableIpcHandlers, IpcRequest } from '../../shared/ipc/contract';
import type { SessionPrincipal } from '../session/session-principal';
import type { LocalePreference } from '../infra/locale-preference-store';
import { createBackupHandlers, type BackupHandlerDeps } from './backup-handlers';
import { createBackupExcelHandlers, type BackupExcelHandlerDeps } from './backup-excel-handlers';
import { createDialogHandlers } from './dialog-handlers';
import { createExternalHandlers } from './external-handlers';
import { createInvoiceHandlers, type InvoiceHandlerDeps } from './invoice-handlers';
import {
  createParentStatementHandlers,
  type ParentStatementHandlerDeps,
} from './parent-statement-handlers';
import {
  createOverdueInvoiceHandlers,
  type OverdueInvoiceHandlerDeps,
} from './overdue-invoice-handlers';
import { createPayslipHandlers, type PayslipHandlerDeps } from './payslip-handlers';
import { createDashboardHandlers, type DashboardHandlerDeps } from './dashboard-handlers';
import { createPayrollHandlers, type PayrollHandlerDeps } from './payroll-handlers';
import { createPaymentReceiptHandlers, type PaymentReceiptHandlerDeps } from './payment-receipt-handlers';
import { createScheduleHandlers, type ScheduleHandlerDeps } from './schedule-handlers';
import { createSyncHandlers, type SyncHandlerDeps } from './sync-handlers';
import { createCenterSwitchHandlers, type CenterSwitchHandlerDeps } from './center-switch-handlers';
import { createUserHandlers, type UserHandlerDeps } from './user-handlers';
import {
  createAttendanceReportingHandlers,
  type AttendanceReportingHandlerDeps,
} from './attendance-reporting-handlers';
import {
  createTeacherAvailabilityHandlers,
  type TeacherAvailabilityHandlerDeps,
} from './teacher-availability-handlers';
import { toSessionOccurrenceView, toWeeklySessionView } from './session-mappers';

/** Only the surface each handler needs — a stub satisfies it in tests. */
export type GetLicenseStatusUseCase = Pick<GetLicenseStatus, 'execute'>;
export type ActivateLicenseUseCase = Pick<ActivateLicense, 'execute'>;
export type CreateSubjectUseCase = Pick<CreateSubject, 'execute'>;
export type ArchiveSubjectUseCase = Pick<ArchiveSubject, 'execute'>;
export type ListSubjectsUseCase = Pick<ListSubjects, 'execute'>;
export type GetSubjectUseCase = Pick<GetSubject, 'execute'>;
export type ListSubjectsWithUsageUseCase = Pick<ListSubjectsWithUsage, 'execute'>;
export type UpdateSubjectUseCase = Pick<UpdateSubject, 'execute'>;
export type CreateNiveauUseCase = Pick<CreateNiveau, 'execute'>;
export type UpdateNiveauUseCase = Pick<UpdateNiveau, 'execute'>;
export type ArchiveNiveauUseCase = Pick<ArchiveNiveau, 'execute'>;
export type ListNiveauxUseCase = Pick<ListNiveaux, 'execute'>;
export type GetNiveauUseCase = Pick<GetNiveau, 'execute'>;
export type ListNiveauxWithUsageUseCase = Pick<ListNiveauxWithUsage, 'execute'>;
export type CreateFormulaUseCase = Pick<CreateFormula, 'execute'>;
export type UpdateFormulaUseCase = Pick<UpdateFormula, 'execute'>;
export type GetFormulaUseCase = Pick<GetFormula, 'execute'>;
export type ListFormulasUseCase = Pick<ListFormulas, 'execute'>;
export type CloneFormulaUseCase = Pick<CloneFormula, 'execute'>;
export type DeactivateFormulaUseCase = Pick<DeactivateFormula, 'execute'>;
export type CreateStudentUseCase = Pick<CreateStudent, 'execute'>;
export type ListStudentsUseCase = Pick<ListStudents, 'execute'>;
export type GetStudentUseCase = Pick<GetStudent, 'execute'>;
export type UpdateStudentUseCase = Pick<UpdateStudent, 'execute'>;
export type SetStudentGuardiansUseCase = Pick<SetStudentGuardians, 'execute'>;
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
export type ReplaceStudentSubscriptionUseCase = Pick<ReplaceStudentSubscription, 'execute'>;
export type ListStudentSubscriptionsUseCase = Pick<ListStudentSubscriptions, 'execute'>;
export type RecordPaymentUseCase = Pick<RecordPayment, 'execute'>;
export type VoidPaymentUseCase = Pick<VoidPayment, 'execute'>;
export type GetInvoicePaymentSummaryUseCase = Pick<GetInvoicePaymentSummary, 'execute'>;
export type ListRecentPaymentsUseCase = Pick<ListRecentPayments, 'execute'>;
export type GetDayTakingsUseCase = Pick<GetDayTakings, 'execute'>;
export type GenerateMonthlyInvoicesUseCase = Pick<GenerateMonthlyInvoices, 'execute'>;
export type EnrollStudentUseCase = Pick<EnrollStudent, 'execute'>;
export type UnenrollStudentUseCase = Pick<UnenrollStudent, 'execute'>;
export type CreateTeacherUseCase = Pick<CreateTeacher, 'execute'>;
export type ListTeachersUseCase = Pick<ListTeachers, 'execute'>;
export type SearchPeopleUseCase = Pick<SearchPeople, 'execute'>;
export type GetTeacherUseCase = Pick<GetTeacher, 'execute'>;
export type UpdateTeacherUseCase = Pick<UpdateTeacher, 'execute'>;
export type ArchiveTeacherUseCase = Pick<ArchiveTeacher, 'execute'>;
export type RestoreTeacherUseCase = Pick<RestoreTeacher, 'execute'>;
export type CreateTeacherPayrollRuleUseCase = Pick<CreateTeacherPayrollRule, 'execute'>;
export type CloseTeacherPayrollRuleUseCase = Pick<CloseTeacherPayrollRule, 'execute'>;
export type ReplaceTeacherPayrollRuleUseCase = Pick<ReplaceTeacherPayrollRule, 'execute'>;
export type ListTeacherPayrollRulesByTeacherUseCase = Pick<ListTeacherPayrollRulesByTeacher, 'execute'>;
export type ComputeMonthlyPayrollsUseCase = Pick<ComputeMonthlyPayrolls, 'execute'>;
export type CreateHolidayUseCase = Pick<CreateHoliday, 'execute'>;
export type ListHolidaysUseCase = Pick<ListHolidays, 'execute'>;
export type UpdateHolidayUseCase = Pick<UpdateHoliday, 'execute'>;
export type ArchiveHolidayUseCase = Pick<ArchiveHoliday, 'execute'>;
export type RestoreHolidayUseCase = Pick<RestoreHoliday, 'execute'>;
export type ListWeekSessionsUseCase = Pick<ListWeekSessions, 'execute'>;
export type GenerateAndPersistSessionsUseCase = Pick<GenerateAndPersistSessions, 'execute'>;
export type UndoGenerationBatchUseCase = Pick<UndoGenerationBatch, 'execute'>;
export type AuditSessionsOutsideHoursUseCase = Pick<AuditSessionsOutsideEffectiveHours, 'execute'>;
export type CancelSessionUseCase = Pick<CancelSession, 'execute'>;
export type CreateWeeklyRecurringSessionUseCase = Pick<CreateWeeklyRecurringSession, 'execute'>;
export type UpdateWeeklyRecurringSessionUseCase = Pick<UpdateWeeklyRecurringSession, 'execute'>;
export type CancelWeeklyRecurringSessionUseCase = Pick<CancelWeeklyRecurringSession, 'execute'>;
export type PreviewGeneratedScheduleUseCase = Pick<PreviewGeneratedSchedule, 'execute'>;
export type CommitGeneratedScheduleUseCase = Pick<CommitGeneratedSchedule, 'execute'>;
export type RecordSessionAttendanceUseCase = Pick<RecordSessionAttendance, 'execute'>;
export type GetStudentAttendanceReportUseCase = Pick<GetStudentAttendanceReport, 'execute'>;
export type GetGroupAttendanceSheetUseCase = Pick<GetGroupAttendanceSheet, 'execute'>;
export type CreateAdminAccountUseCase = Pick<CreateAdminAccount, 'execute'>;
export type CreateUserUseCase = Pick<CreateUser, 'execute'>;
export type RedeemSetupCodeUseCase = Pick<RedeemSetupCode, 'execute'>;
export type ChangeAdminPasswordUseCase = Pick<ChangeAdminPassword, 'execute'>;
export type SaveCenterHoursUseCase = Pick<SaveCenterHours, 'execute'>;
export type GetCenterHoursUseCase = Pick<GetCenterHours, 'execute'>;
export type SaveCenterHoursOverrideUseCase = Pick<SaveCenterHoursOverride, 'execute'>;
export type GetCenterHoursOverridesUseCase = Pick<GetCenterHoursOverrides, 'execute'>;
export type GetActiveCenterHoursOverrideUseCase = Pick<GetActiveCenterHoursOverride, 'execute'>;
export type ArchiveCenterHoursOverrideUseCase = Pick<ArchiveCenterHoursOverride, 'execute'>;
export type AttemptLoginUseCase = Pick<AttemptLogin, 'execute'>;
export type GenerateRecoveryCodesUseCase = Pick<GenerateRecoveryCodes, 'execute'>;
export type VerifyRecoveryCodeUseCase = Pick<VerifyRecoveryCode, 'execute'>;
export type ResetPasswordWithRecoveryCodeUseCase = Pick<ResetPasswordWithRecoveryCode, 'execute'>;
export type SetSecurityQuestionsUseCase = Pick<SetSecurityQuestions, 'execute'>;
export type VerifySecurityAnswersUseCase = Pick<VerifySecurityAnswers, 'execute'>;
export type RequestPasswordResetViaSecurityQuestionsUseCase = Pick<
  RequestPasswordResetViaSecurityQuestions,
  'execute'
>;
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

/** Project a Student to its boundary DTO: envelope mostly stripped, dates
 *  serialized, `archived` derived from the soft-delete tombstone. `version` is
 *  kept (see the note on `studentViewSchema`) so `student.setGuardians` callers
 *  can round-trip it as `expectedVersion`. */
function toStudentView(student: Student) {
  return {
    id: student.id,
    name: { fr: student.name.fr, ar: student.name.ar },
    birthDate: student.birthDate,
    level: student.level,
    school: student.school,
    notes: student.notes,
    guardianIds: [...student.guardianIds],
    niveauId: student.niveauId,
    archived: student.deletedAt !== null,
    createdAt: student.createdAt.toISOString(),
    version: student.version,
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

/** Project a Niveau to its boundary DTO (SOU-260): envelope stripped, leaving
 *  the fields the pickers and the manage screen need. `active` is the real
 *  domain flag; tombstones never reach these reads, so no `archived` is exposed. */
function toNiveauView(niveau: Niveau) {
  return {
    id: niveau.id,
    name: { fr: niveau.name.fr, ar: niveau.name.ar },
    code: niveau.code,
    category: niveau.category,
    active: niveau.active,
  };
}

/** Project a niveau + its in-use count to the list-with-usage DTO: the lean
 *  niveau view plus `inUseCount`, the derived `canDelete`, and the named
 *  breakdown (`references`) the delete-blocked modal lists. */
function toNiveauUsageView(row: NiveauUsage) {
  return {
    niveau: toNiveauView(row.niveau),
    inUseCount: row.inUseCount,
    canDelete: row.canDelete,
    references: row.references.map((ref) => ({
      kind: ref.kind,
      id: ref.id,
      label: { fr: ref.label.fr, ar: ref.label.ar },
    })),
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

/** Project a Formula to its boundary DTO (SOU-62): envelope stripped. No `archived`
 *  field — this CRUD UI has no soft-delete action, only the one-way `active` flag. */
function toFormulaView(formula: Formula) {
  return {
    id: formula.id,
    name: { fr: formula.name.fr, ar: formula.name.ar },
    subjectIds: [...formula.subjectIds],
    priceMad: formula.priceMad,
    kind: formula.kind,
    isImmutable: formula.isImmutable,
    active: formula.active,
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
    niveauId: group.niveauId,
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
    note: payment.note,
    createdAt: payment.createdAt.toISOString(),
  };
}

/** Project a cross-invoice recent-payment read-model row to its boundary DTO
 *  (SOU-198). The read model is already envelope-free with a day-string `paidOn`,
 *  so this is a near-identity mapping — no dates to serialize. */
function toRecentPaymentView(row: RecentPaymentView) {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    kind: row.kind,
    amountMad: row.amountMad,
    method: row.method,
    paidOn: row.paidOn,
    studentId: row.studentId,
    studentName: row.studentName,
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
    niveauIds: [...teacher.niveauIds],
    archived: teacher.deletedAt !== null,
    createdAt: teacher.createdAt.toISOString(),
  };
}

/** Project a TeacherPayrollRule to its boundary DTO: envelope stripped. No
 *  `archived` field — `listLiveByTeacher` only ever returns live rows, and the
 *  renderer derives active/history from `startMonth`/`endMonth`, not a tombstone. */
function toTeacherPayrollRuleView(rule: TeacherPayrollRule) {
  return rule.kind === 'fixed-monthly'
    ? {
        id: rule.id,
        teacherId: rule.teacherId,
        kind: rule.kind,
        amountMad: rule.amountMad,
        startMonth: rule.startMonth,
        endMonth: rule.endMonth,
      }
    : {
        id: rule.id,
        teacherId: rule.teacherId,
        kind: rule.kind,
        percent: rule.percent,
        startMonth: rule.startMonth,
        endMonth: rule.endMonth,
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

/** Project a CenterHoursOverride to its boundary DTO: envelope stripped, dates
 *  passed through, `archived` derived from the soft-delete tombstone.
 *  `hoursByWeekday` crosses the wire as the same `0..6`-keyed record the domain
 *  entity carries (the renderer aliases `Record<0..6, TimeWindow[]>`). */
function toCenterHoursOverrideView(override: CenterHoursOverride) {
  const dayWindows = (dayOfWeek: WeekdayIndex) =>
    override.hoursByWeekday[dayOfWeek].map((window) => ({ open: window.open, close: window.close }));
  return {
    id: override.id,
    dateRange: { start: override.dateRange.start, end: override.dateRange.end },
    hoursByWeekday: {
      0: dayWindows(0),
      1: dayWindows(1),
      2: dayWindows(2),
      3: dayWindows(3),
      4: dayWindows(4),
      5: dayWindows(5),
      6: dayWindows(6),
    },
    archived: override.deletedAt !== null,
    createdAt: override.createdAt.toISOString(),
  };
}

/** Project a concrete dated session to its boundary DTO: envelope stripped, the
 *  branded id / `TimeOfDay` values widened to plain strings for the wire. */
function toSessionView(session: Session) {
  return {
    id: session.id,
    recurringSessionId: session.recurringSessionId,
    generationBatchId: session.generationBatchId,
    roomId: session.roomId,
    teacherId: session.teacherId,
    date: session.date,
    start: session.start,
    end: session.end,
  };
}

/**
 * Widens the IPC boundary's `session.generator.preview` request (plain strings/
 * numbers, already Zod-validated) to the domain's own branded
 * `SessionGeneratorConfig` — the same widening `student.setGuardians` already
 * does for `guardianIds as ParentId[]`. `kind` and `weekdayPool`'s element type
 * are plain literal unions in the domain (not branded), so only the scope's id
 * arrays and the weekday numbers need a cast.
 */
function toSessionGeneratorConfig(
  request: IpcRequest<'session.generator.preview'>,
): SessionGeneratorConfig {
  const scope: SessionGeneratorScope = {
    groups: request.scope.groups === 'all' ? 'all' : (request.scope.groups as GroupId[]),
    teachers: request.scope.teachers === 'all' ? 'all' : (request.scope.teachers as TeacherId[]),
  };
  const base = {
    scope,
    kind: request.kind,
    weekdayPool: request.weekdayPool as WeekdayIndex[],
    sessionsPerWeek: request.sessionsPerWeek,
    minGapDays: request.minGapDays,
    sessionDurationMinutes: request.sessionDurationMinutes,
    range: request.range,
  };
  return request.mode === 'auto'
    ? { ...base, mode: 'auto' }
    : { ...base, mode: 'custom', pickedWeekdays: request.pickedWeekdays as WeekdayIndex[] };
}

/** Project one generator run's proposed group schedule to its boundary DTO:
 *  the block's `WeeklyBlock` flattened alongside its assigned `roomId`. */
function toGroupScheduleProposalView(proposal: GroupScheduleProposal) {
  return {
    groupId: proposal.groupId,
    blocks: proposal.blocks.map((scheduled) => ({
      dayOfWeek: scheduled.block.dayOfWeek,
      start: scheduled.block.start,
      end: scheduled.block.end,
      roomId: scheduled.roomId,
      teacherId: scheduled.teacherId,
    })),
    gapViolations: proposal.gapViolations.map((gap) => ({
      fromDay: gap.fromDay,
      toDay: gap.toDay,
      gapDays: gap.gapDays,
    })),
  };
}

/** Project one non-blocking generator conflict to its boundary DTO: the
 *  thrown-error-shaped domain value is flattened to plain structured data,
 *  since it never actually crosses the boundary as a thrown error here. */
function toGeneratedScheduleConflictView(conflict: GeneratedScheduleConflict) {
  if (conflict.kind === 'hours') {
    return {
      kind: 'hours' as const,
      groupId: conflict.groupId,
      dayOfWeek: conflict.error.dayOfWeek,
      start: conflict.start,
      end: conflict.end,
      reason: conflict.error.reason,
      open: conflict.error.open,
      close: conflict.error.close,
    };
  }
  if (conflict.kind === 'teacher') {
    return {
      kind: 'teacher' as const,
      groupId: conflict.groupId,
      teacherId: conflict.error.teacherId,
      dayOfWeek: conflict.error.dayOfWeek,
      start: conflict.start,
      end: conflict.end,
      conflicts: conflict.error.conflicts.map((ref) => ({
        id: ref.id,
        roomId: ref.roomId,
        teacherId: ref.teacherId,
        dayOfWeek: ref.dayOfWeek,
        start: ref.start,
        end: ref.end,
      })),
    };
  }
  if (conflict.kind === 'teacher-availability') {
    return {
      kind: 'teacher-availability' as const,
      groupId: conflict.groupId,
      teacherId: conflict.error.teacherId,
      dayOfWeek: conflict.error.dayOfWeek,
      start: conflict.start,
      end: conflict.end,
      reason: conflict.error.reason,
      windows: conflict.error.windows.map((window) => ({ open: window.open, close: window.close })),
      exception:
        conflict.error.exception === null
          ? null
          : { start: conflict.error.exception.start, end: conflict.error.exception.end },
    };
  }
  if (conflict.kind === 'capacity') {
    return {
      kind: 'capacity' as const,
      groupId: conflict.groupId,
      roomId: conflict.roomId,
      dayOfWeek: conflict.dayOfWeek,
      start: conflict.start,
      end: conflict.end,
      groupCapacity: conflict.groupCapacity,
      roomCapacity: conflict.roomCapacity,
    };
  }
  return {
    kind: 'room' as const,
    groupId: conflict.groupId,
    roomId: conflict.error.roomId,
    dayOfWeek: conflict.error.dayOfWeek,
    start: conflict.start,
    end: conflict.end,
    conflicts: conflict.error.conflicts.map((ref) => ({
      id: ref.id,
      roomId: ref.roomId,
      dayOfWeek: ref.dayOfWeek,
      start: ref.start,
      end: ref.end,
    })),
  };
}

/** Project one committed generator template to its boundary DTO. */
function toCommittedGeneratedTemplateView(template: CommittedGeneratedTemplate) {
  return {
    groupId: template.groupId,
    recurringSessionId: template.recurringSessionId,
    generationBatchId: template.generationBatchId,
    skippedHolidays: template.skippedHolidays.map((skipped) => ({
      date: skipped.date,
      holidayId: skipped.holiday.id,
      holidayName: skipped.holiday.name,
    })),
  };
}

/** Project one roll-call outcome to its boundary DTO: envelope stripped, `note`
 *  omitted (out of scope this ticket — always `null` in the domain). */
function toAttendanceRecordView(record: AttendanceRecord) {
  return {
    id: record.id,
    sessionId: record.sessionId,
    studentId: record.studentId,
    status: record.status,
  };
}

/** Strip the envelope: the renderer only needs the editable weekday fields. */
function toWeekView(week: readonly CenterHours[]) {
  return week.map((hours) => ({
    dayOfWeek: hours.dayOfWeek,
    windows: hours.windows.map((window) => ({ open: window.open, close: window.close })),
  }));
}

/**
 * IPC handler implementations. Dependencies (app version, active plan, wired use
 * cases) are injected so handlers stay pure and testable without Electron. Each
 * handler delegates to a pre-wired domain use case; it adds no business logic.
 */
export type HandlerDeps = BackupHandlerDeps &
  BackupExcelHandlerDeps &
  InvoiceHandlerDeps &
  ParentStatementHandlerDeps &
  OverdueInvoiceHandlerDeps &
  PayslipHandlerDeps &
  DashboardHandlerDeps &
  PayrollHandlerDeps &
  PaymentReceiptHandlerDeps &
  ScheduleHandlerDeps &
  AttendanceReportingHandlerDeps &
  SyncHandlerDeps &
  CenterSwitchHandlerDeps &
  UserHandlerDeps &
  TeacherAvailabilityHandlerDeps & {
  appVersion: () => string;
  activePlanId: () => PlanId;
  activePlanFeatures: () => readonly FeatureFlag[];
  setActivePlan: (planId: PlanId) => void;
  getLicenseStatus: GetLicenseStatusUseCase;
  activateLicense: ActivateLicenseUseCase;
  createSubject: CreateSubjectUseCase;
  archiveSubject: ArchiveSubjectUseCase;
  listSubjects: ListSubjectsUseCase;
  getSubject: GetSubjectUseCase;
  listSubjectsWithUsage: ListSubjectsWithUsageUseCase;
  updateSubject: UpdateSubjectUseCase;
  createNiveau: CreateNiveauUseCase;
  updateNiveau: UpdateNiveauUseCase;
  archiveNiveau: ArchiveNiveauUseCase;
  listNiveaux: ListNiveauxUseCase;
  getNiveau: GetNiveauUseCase;
  listNiveauxWithUsage: ListNiveauxWithUsageUseCase;
  createFormula: CreateFormulaUseCase;
  updateFormula: UpdateFormulaUseCase;
  getFormula: GetFormulaUseCase;
  listFormulas: ListFormulasUseCase;
  cloneFormula: CloneFormulaUseCase;
  deactivateFormula: DeactivateFormulaUseCase;
  createStudent: CreateStudentUseCase;
  listStudents: ListStudentsUseCase;
  getStudent: GetStudentUseCase;
  updateStudent: UpdateStudentUseCase;
  setStudentGuardians: SetStudentGuardiansUseCase;
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
  replaceStudentSubscription: ReplaceStudentSubscriptionUseCase;
  listStudentSubscriptions: ListStudentSubscriptionsUseCase;
  recordPayment: RecordPaymentUseCase;
  voidPayment: VoidPaymentUseCase;
  getInvoicePaymentSummary: GetInvoicePaymentSummaryUseCase;
  listRecentPayments: ListRecentPaymentsUseCase;
  getDayTakings: GetDayTakingsUseCase;
  generateMonthlyInvoices: GenerateMonthlyInvoicesUseCase;
  enrollStudent: EnrollStudentUseCase;
  unenrollStudent: UnenrollStudentUseCase;
  createTeacher: CreateTeacherUseCase;
  listTeachers: ListTeachersUseCase;
  searchPeople: SearchPeopleUseCase;
  getTeacher: GetTeacherUseCase;
  updateTeacher: UpdateTeacherUseCase;
  archiveTeacher: ArchiveTeacherUseCase;
  restoreTeacher: RestoreTeacherUseCase;
  createTeacherPayrollRule: CreateTeacherPayrollRuleUseCase;
  closeTeacherPayrollRule: CloseTeacherPayrollRuleUseCase;
  replaceTeacherPayrollRule: ReplaceTeacherPayrollRuleUseCase;
  listTeacherPayrollRulesByTeacher: ListTeacherPayrollRulesByTeacherUseCase;
  computeMonthlyPayrolls: ComputeMonthlyPayrollsUseCase;
  createHoliday: CreateHolidayUseCase;
  listHolidays: ListHolidaysUseCase;
  updateHoliday: UpdateHolidayUseCase;
  archiveHoliday: ArchiveHolidayUseCase;
  restoreHoliday: RestoreHolidayUseCase;
  listWeekSessions: ListWeekSessionsUseCase;
  generateSessions: GenerateAndPersistSessionsUseCase;
  undoGenerationBatch: UndoGenerationBatchUseCase;
  auditSessionsOutsideHours: AuditSessionsOutsideHoursUseCase;
  cancelSession: CancelSessionUseCase;
  recordSessionAttendance: RecordSessionAttendanceUseCase;
  getStudentAttendanceReport: GetStudentAttendanceReportUseCase;
  getGroupAttendanceSheet: GetGroupAttendanceSheetUseCase;
  createWeeklySession: CreateWeeklyRecurringSessionUseCase;
  updateWeeklySession: UpdateWeeklyRecurringSessionUseCase;
  cancelWeeklySession: CancelWeeklyRecurringSessionUseCase;
  previewGeneratedSchedule: PreviewGeneratedScheduleUseCase;
  commitGeneratedSchedule: CommitGeneratedScheduleUseCase;
  saveCenterHours: SaveCenterHoursUseCase;
  getCenterHours: GetCenterHoursUseCase;
  saveCenterHoursOverride: SaveCenterHoursOverrideUseCase;
  getCenterHoursOverrides: GetCenterHoursOverridesUseCase;
  getActiveCenterHoursOverride: GetActiveCenterHoursOverrideUseCase;
  archiveCenterHoursOverride: ArchiveCenterHoursOverrideUseCase;
  envelopeContext: () => EnvelopeContext;
  adminExists: AdminExists;
  adminUsername: () => Promise<string>;
  createAdminAccount: CreateAdminAccountUseCase;
  // createUser / redeemSetupCode / listUsers / resolvePrincipal come from
  // UserHandlerDeps (the extracted user-management channel factory, SOU-265).
  now: () => Date;
  changeAdminPassword: ChangeAdminPasswordUseCase;
  attemptLogin: AttemptLoginUseCase;
  deviceSessions: DeviceSessions;
  /** Establish the trusted principal in memory from a just-verified login (SOU-265),
   *  independent of whether a remember-me session was persisted. Login is the
   *  authoritative moment identity is set; the persisted-session re-resolve only
   *  serves the remember-me reopen path. */
  setPrincipal: (principal: SessionPrincipal) => void;
  /** Drop the cached session principal (logout / password reset / session
   *  invalidation) so later writes stop attributing to it and the role guard
   *  fails closed until the device authenticates again. */
  clearPrincipal: () => void;
  generateRecoveryCodes: GenerateRecoveryCodesUseCase;
  verifyRecoveryCode: VerifyRecoveryCodeUseCase;
  resetPasswordWithRecoveryCode: ResetPasswordWithRecoveryCodeUseCase;
  countRemainingRecoveryCodes: () => Promise<number>;
  setSecurityQuestions: SetSecurityQuestionsUseCase;
  verifySecurityAnswers: VerifySecurityAnswersUseCase;
  requestPasswordResetViaSecurityQuestions: RequestPasswordResetViaSecurityQuestionsUseCase;
  securityQuestionsExist: () => Promise<boolean>;
  getCenterProfile: GetCenterProfileUseCase;
  saveCenterProfile: SaveCenterProfileUseCase;
  storeCenterLogo: StoreCenterLogoUseCase;
  readCenterLogo: ReadCenterLogoUseCase;
  centerContext: () => CenterContext;
  saveLocalePreference: (locale: LocalePreference) => void;
};

export function createHandlers(deps: HandlerDeps): RegisterableIpcHandlers {
  const handlers: RegisterableIpcHandlers = {
    'app.ping': (request) => ({
      reply: `pong: ${request.message}`,
      appVersion: deps.appVersion(),
    }),
    'plan.get': () => ({
      planId: deps.activePlanId(),
      features: [...deps.activePlanFeatures()],
    }),
    'license.status': () => deps.getLicenseStatus.execute(),
    'license.activate': (request) => deps.activateLicense.execute({ rawLicense: request.license }),
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
    'niveau.create': async (request) => {
      const niveau = await deps.createNiveau.execute({ ...request, ...deps.envelopeContext() });
      return { id: niveau.id };
    },
    'niveau.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const niveau = await deps.updateNiveau.execute({
        ...fields,
        centerCode,
        id: id as NiveauId,
        updatedBy,
      });
      return { niveau: toNiveauView(niveau) };
    },
    'niveau.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveNiveau.execute({
          centerCode,
          niveauId: request.id as NiveauId,
          updatedBy,
        });
      } catch (error) {
        // Archiving is idempotent at the boundary: an already-archived or unknown
        // niveau means the desired end-state (row inactive) already holds, so
        // report success instead of a generic error toast. The domain use case
        // still throws so other callers/tests stay strict. (NiveauInUseError is a
        // real failure and is NOT swallowed — the UI must tell the user to detach
        // the niveau's students/groups/teachers first.) Mirrors subject.archive.
        if (!(error instanceof NiveauNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'niveau.list': async (request) => {
      const niveaux = await deps.listNiveaux.execute({
        centerCode: deps.envelopeContext().centerCode,
        scope: request.scope,
      });
      return { niveaux: niveaux.map(toNiveauView) };
    },
    'niveau.get': async (request) => {
      const niveau = await deps.getNiveau.execute({
        centerCode: deps.envelopeContext().centerCode,
        id: request.id as NiveauId,
      });
      return { niveau: niveau ? toNiveauView(niveau) : null };
    },
    'niveau.listWithUsage': async () => {
      const rows = await deps.listNiveauxWithUsage.execute({
        centerCode: deps.envelopeContext().centerCode,
      });
      return { niveaux: rows.map(toNiveauUsageView) };
    },
    'formula.create': async (request) => {
      const formula = await deps.createFormula.execute({ ...request, ...deps.envelopeContext() });
      return { id: formula.id };
    },
    'formula.list': async (request) => {
      const formulas = await deps.listFormulas.execute({
        centerCode: deps.envelopeContext().centerCode,
        scope: request.scope,
      });
      return { formulas: formulas.map(toFormulaView) };
    },
    'formula.get': async (request) => {
      const formula = await deps.getFormula.execute({
        centerCode: deps.envelopeContext().centerCode,
        id: request.id as FormulaId,
      });
      return { formula: formula ? toFormulaView(formula) : null };
    },
    'formula.update': async (request) => {
      const { id, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const formula = await deps.updateFormula.execute({
        ...fields,
        centerCode,
        id: id as FormulaId,
        updatedBy,
      });
      return { formula: toFormulaView(formula) };
    },
    'formula.clone': async (request) => {
      const { centerCode, deviceOrigin, updatedBy } = deps.envelopeContext();
      const clone = await deps.cloneFormula.execute({
        centerCode,
        sourceId: request.id as FormulaId,
        deviceOrigin,
        updatedBy,
      });
      return { id: clone.id };
    },
    'formula.deactivate': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      const formula = await deps.deactivateFormula.execute({
        centerCode,
        id: request.id as FormulaId,
        updatedBy,
      });
      return { formula: toFormulaView(formula) };
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
    'student.setGuardians': async (request) => {
      const { id, guardianIds, expectedVersion } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const student = await deps.setStudentGuardians.execute({
        centerCode,
        id: id as StudentId,
        guardianIds: guardianIds as ParentId[],
        expectedVersion,
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
    'subscription.replace': async (request) => {
      const { activeSubscriptionId, ...fields } = request;
      const { closed, created } = await deps.replaceStudentSubscription.execute({
        ...fields,
        activeSubscriptionId: activeSubscriptionId as StudentSubscriptionId,
        ...deps.envelopeContext(),
      });
      return {
        closed: toSubscriptionView(closed),
        created: toSubscriptionView(created),
      };
    },
    'subscription.list': async (request) => {
      const subscriptions = await deps.listStudentSubscriptions.execute({
        centerCode: deps.envelopeContext().centerCode,
        studentId: request.studentId as StudentId,
      });
      return { subscriptions: subscriptions.map(toSubscriptionView) };
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
    'payment.recent': async (request) => {
      const rows = await deps.listRecentPayments.execute({
        centerCode: deps.envelopeContext().centerCode,
        ...(request.from !== undefined && { from: request.from }),
        ...(request.to !== undefined && { to: request.to }),
        ...(request.method !== undefined && { method: request.method }),
        ...(request.limit !== undefined && { limit: request.limit }),
      });
      return { payments: rows.map(toRecentPaymentView) };
    },
    'payment.takings': async (request) => {
      const takings = await deps.getDayTakings.execute({
        centerCode: deps.envelopeContext().centerCode,
        day: request.day,
      });
      return {
        netMad: takings.netMad,
        paymentCount: takings.paymentCount,
        byMethod: takings.byMethod,
      };
    },
    'invoice.generateMonthly': async (request) => {
      return deps.generateMonthlyInvoices.execute({
        month: request.month,
        ...deps.envelopeContext(),
      });
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
    'people.search': async (request) => {
      const results = await deps.searchPeople.execute({
        centerCode: deps.envelopeContext().centerCode,
        query: request.query,
      });
      return {
        results: results.map((result) =>
          result.kind === 'student'
            ? { kind: 'student' as const, person: toStudentView(result.entity) }
            : result.kind === 'teacher'
              ? { kind: 'teacher' as const, person: toTeacherView(result.entity) }
              : { kind: 'parent' as const, person: toParentView(result.entity) },
        ),
      };
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
    'teacherPayrollRule.create': async (request) => {
      const rule = await deps.createTeacherPayrollRule.execute({
        ...request,
        ...deps.envelopeContext(),
      });
      return { id: rule.id };
    },
    'teacherPayrollRule.close': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      const rule = await deps.closeTeacherPayrollRule.execute({
        centerCode,
        ruleId: request.ruleId as TeacherPayrollRuleId,
        endMonth: request.endMonth,
        updatedBy,
      });
      return { rule: toTeacherPayrollRuleView(rule) };
    },
    'teacherPayrollRule.replace': async (request) => {
      const { activeRuleId, ...fields } = request;
      const { closed, created } = await deps.replaceTeacherPayrollRule.execute({
        ...fields,
        activeRuleId: activeRuleId as TeacherPayrollRuleId,
        ...deps.envelopeContext(),
      });
      return {
        closed: toTeacherPayrollRuleView(closed),
        created: toTeacherPayrollRuleView(created),
      };
    },

    'teacherPayrollRule.list': async (request) => {
      const rules = await deps.listTeacherPayrollRulesByTeacher.execute({
        centerCode: deps.envelopeContext().centerCode,
        teacherId: request.teacherId as TeacherId,
      });
      return { rules: rules.map(toTeacherPayrollRuleView) };
    },
    'payroll.computeMonthly': async (request) => {
      return deps.computeMonthlyPayrolls.execute({
        month: request.month,
        ...deps.envelopeContext(),
      });
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
      const { generationBatchId, sessions, skippedHolidays, skippedOutsideHours } =
        await deps.generateSessions.execute({
          centerCode,
          recurringSessionId: request.recurringSessionId as WeeklyRecurringSessionId,
          range: { start: request.from, end: request.to },
          deviceOrigin,
          updatedBy,
          overrideHolidayDates: request.overrideHolidayDates ?? [],
        });
      return {
        generationBatchId,
        sessions: sessions.map(toSessionView),
        skippedHolidays: skippedHolidays.map((skipped) => ({
          date: skipped.date,
          holidayId: skipped.holiday.id,
          holidayName: skipped.holiday.name,
        })),
        skippedOutsideHours: skippedOutsideHours.map((skipped) => ({
          date: skipped.date,
          windows: skipped.windows.map((window) => ({ open: window.open, close: window.close })),
        })),
      };
    },
    'session.undoGenerationBatch': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      // Not swallowed like *.archive: an unknown, foreign-center, or
      // already-fully-cancelled batch id (GenerationBatchNotFoundError) is
      // rejected rather than silently no-op'ing, so a stale renderer id can
      // never masquerade as success.
      return deps.undoGenerationBatch.execute({
        centerCode,
        generationBatchId: request.generationBatchId as GenerationBatchId,
        updatedBy,
      });
    },
    'session.audit.outside-hours': async () => {
      const { sessionsOutsideEffectiveHours } = await deps.auditSessionsOutsideHours.execute({
        centerCode: deps.envelopeContext().centerCode,
      });
      return {
        sessionsOutsideEffectiveHours: sessionsOutsideEffectiveHours.map((stranded) => ({
          session: toSessionOccurrenceView(stranded.session),
          reason: stranded.reason,
        })),
      };
    },
    'session.cancel': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      // Not swallowed like *.archive: an unknown, foreign-center, or
      // already-cancelled occurrence id (SessionNotFoundError) is rejected rather
      // than silently no-op'ing, so a stale renderer id can never look like success.
      await deps.cancelSession.execute({
        centerCode,
        id: request.id as SessionId,
        updatedBy,
      });
      return { ok: true as const };
    },
    'attendance.record': async (request) => {
      const { centerCode, deviceOrigin, updatedBy } = deps.envelopeContext();
      const records = await deps.recordSessionAttendance.execute({
        sessionId: request.sessionId,
        records: request.records,
        centerCode,
        deviceOrigin,
        updatedBy,
      });
      return { records: records.map(toAttendanceRecordView) };
    },
    'weeklySession.create': async (request) => {
      // `allowScheduleConflict` is spread only when present (exactOptionalPropertyTypes:
      // the domain input's optional flag rejects an explicit `undefined`).
      const { allowScheduleConflict, ...fields } = request;
      const session = await deps.createWeeklySession.execute({
        ...fields,
        ...deps.envelopeContext(),
        ...(allowScheduleConflict !== undefined ? { allowScheduleConflict } : {}),
      });
      return { id: session.id };
    },
    'weeklySession.update': async (request) => {
      const { id, allowScheduleConflict, ...fields } = request;
      const { centerCode, updatedBy } = deps.envelopeContext();
      const session = await deps.updateWeeklySession.execute({
        ...fields,
        centerCode,
        id: id as WeeklyRecurringSessionId,
        updatedBy,
        ...(allowScheduleConflict !== undefined ? { allowScheduleConflict } : {}),
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
    'session.generator.preview': async (request) => {
      const { centerCode } = deps.envelopeContext();
      const result = await deps.previewGeneratedSchedule.execute({
        centerCode,
        config: toSessionGeneratorConfig(request),
      });
      return {
        proposals: result.proposals.map(toGroupScheduleProposalView),
        conflicts: result.conflicts.map(toGeneratedScheduleConflictView),
      };
    },
    'session.generator.commit': async (request) => {
      const { centerCode, deviceOrigin, updatedBy } = deps.envelopeContext();
      const proposals: CommitGroupProposal[] = request.proposals.map((proposal) => ({
        groupId: proposal.groupId as GroupId,
        blocks: proposal.blocks.map((scheduled) => ({
          block: {
            dayOfWeek: scheduled.dayOfWeek as WeekdayIndex,
            start: scheduled.start as TimeOfDay,
            end: scheduled.end as TimeOfDay,
          },
          roomId: scheduled.roomId as RoomId,
          allowScheduleConflict: scheduled.allowScheduleConflict ?? false,
        })),
      }));
      const result = await deps.commitGeneratedSchedule.execute({
        centerCode,
        deviceOrigin,
        updatedBy,
        mode: request.mode,
        proposals,
        range: request.range,
      });
      return { templates: result.templates.map(toCommittedGeneratedTemplateView) };
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
    'centerHoursOverride.list': async (request) => {
      const overrides = await deps.getCenterHoursOverrides.execute({
        centerCode: deps.envelopeContext().centerCode,
        ...(request.range !== undefined ? { range: request.range } : {}),
      });
      return { overrides: overrides.map(toCenterHoursOverrideView) };
    },
    'centerHoursOverride.getActive': async (request) => {
      const override = await deps.getActiveCenterHoursOverride.execute({
        centerCode: deps.envelopeContext().centerCode,
        date: request.date,
      });
      return { override: override === null ? null : toCenterHoursOverrideView(override) };
    },
    'centerHoursOverride.save': async (request) => {
      const { centerCode, deviceOrigin, updatedBy } = deps.envelopeContext();
      const override = await deps.saveCenterHoursOverride.execute({
        centerCode,
        deviceOrigin,
        updatedBy,
        ...(request.id !== undefined ? { id: request.id as CenterHoursOverrideId } : {}),
        dateRange: request.dateRange,
        hoursByWeekday: request.hoursByWeekday,
      });
      return { override: toCenterHoursOverrideView(override) };
    },
    'centerHoursOverride.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveCenterHoursOverride.execute({
          centerCode,
          overrideId: request.id as CenterHoursOverrideId,
          updatedBy,
        });
      } catch (error) {
        // Archiving is idempotent at the boundary: an already-archived or unknown
        // override means the desired end-state (row inactive) already holds, so
        // report success instead of a generic error toast. The domain use case
        // still throws so other callers/tests stay strict. Mirrors holiday.archive.
        if (!(error instanceof CenterHoursOverrideNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'admin.exists': async () => ({ exists: await deps.adminExists() }),
    'admin.create': async (request) => {
      const account = await deps.createAdminAccount.execute(request);
      return { id: account.id };
    },
    'admin.changePassword': async (request) => {
      await deps.changeAdminPassword.execute(request);
      return { ok: true };
    },
    'auth.login': async (request) => {
      const result = await deps.attemptLogin.execute(request);
      switch (result.outcome) {
        case 'success':
          // Login is the authoritative moment the principal is established
          // (SOU-265): the use case already verified the credential and resolved
          // who is in, so set it in memory directly from that result — regardless
          // of whether a remember-me session was persisted. A non-remembered
          // login persists no session, so re-reading it would wrongly resolve to
          // null and both drop attribution and lock the director out of the guard.
          deps.setPrincipal({ userId: result.user.userId, role: result.user.role });
          return { outcome: 'success' };
        case 'invalid-credentials':
          return { outcome: 'invalid-credentials', remainingAttempts: result.remainingAttempts };
        case 'locked-out':
          return { outcome: 'locked-out', lockedUntilMs: result.lockedUntil };
      }
    },
    'auth.session': async () => {
      // Only reports whether the device is remembered. It must NOT re-resolve the
      // principal (SOU-265): a non-remembered login established the principal in
      // memory with no persisted session, so re-reading the session here would
      // wrongly wipe it. The remember-me reopen path re-resolves once, at the
      // startup seed in the composition root — the single re-resolution site.
      return { authenticated: await deps.deviceSessions.isAuthenticated() };
    },
    'auth.logout': async () => {
      await deps.deviceSessions.forget();
      deps.clearPrincipal();
      return { ok: true };
    },
    'admin.recovery.generate': async () => {
      if (!(await deps.deviceSessions.isAuthenticated())) throw new NotAuthenticatedError();
      const username = await deps.adminUsername();
      const codes = await deps.generateRecoveryCodes.execute(username);
      return { codes: [...codes] };
    },
    'admin.recovery.count': async () => {
      const remaining = await deps.countRemainingRecoveryCodes();
      return { remaining };
    },
    'auth.resetWithCode': async (request) => {
      const username = await deps.adminUsername();
      const result = await deps.resetPasswordWithRecoveryCode.execute({
        recoveryCode: request.code,
        newPassword: request.password,
        username,
      });
      switch (result.outcome) {
        case 'success':
          // The reset invalidated the device session (see the reset use case's
          // unit of work), so the in-memory principal is now stale — drop it too
          // (SOU-265) or the role guard and write attribution would trust a
          // credential the user just reset. Every session-invalidating path must
          // clear the principal, not only logout.
          deps.clearPrincipal();
          return { outcome: 'success' };
        case 'locked-out':
          return { outcome: 'locked-out', lockedUntilMs: result.lockedUntil };
      }
    },
    'admin.securityQuestions.bank': async () => ({ keys: [...SECURITY_QUESTION_KEYS] }),
    'admin.securityQuestions.exists': async () => ({ exists: await deps.securityQuestionsExist() }),
    'admin.securityQuestions.set': async (request) => {
      if (!(await deps.deviceSessions.isAuthenticated())) throw new NotAuthenticatedError();
      const username = await deps.adminUsername();
      await deps.setSecurityQuestions.execute(username, request);
      return { ok: true };
    },
    // TODO(SOU-167): channel is intentionally inert in the MVP — the security-Q
    // reset UI is descoped and this use case can only return confirmation-required
    // (never writes a password) until the SOU-157 email-confirmation step exists.
    'auth.resetWithSecurityQuestions': async (request) => {
      const username = await deps.adminUsername();
      const result = await deps.requestPasswordResetViaSecurityQuestions.execute(username, request);
      switch (result.outcome) {
        case 'confirmation-required':
          return { outcome: 'confirmation-required' };
        case 'invalid-answer':
          return { outcome: 'invalid-answer', remainingAttempts: result.remainingAttempts };
        case 'locked-out':
          return { outcome: 'locked-out', lockedUntilMs: result.lockedUntil };
      }
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
    ...createBackupHandlers(deps),
    ...createBackupExcelHandlers(deps),
    ...createDialogHandlers(deps.dialogPaths),
    ...createExternalHandlers(),
    ...createInvoiceHandlers(deps),
    ...createParentStatementHandlers(deps),
    ...createOverdueInvoiceHandlers(deps),
    ...createPayslipHandlers(deps),
    ...createDashboardHandlers(deps),
    ...createPayrollHandlers(deps),
    ...createPaymentReceiptHandlers(deps),
    ...createScheduleHandlers(deps),
    ...createAttendanceReportingHandlers(deps),
    ...createSyncHandlers(deps),
    ...createCenterSwitchHandlers(deps),
    ...createUserHandlers(deps),
    ...createTeacherAvailabilityHandlers(deps),
  };

  // Dev-only plan switcher (SOU-98): `import.meta.env.DEV` is a build-time
  // constant electron-vite statically replaces with `false` in a production
  // build, so this block — and with it any runtime path that mutates PlanPolicy
  // — is tree-shaken out of the packaged main bundle. In production `plan.set`
  // is never added, `MainRuntime` skips the unwired channel, and a packaged
  // renderer's `invoke('plan.set', …)` hits no `ipcMain.handle` and is rejected.
  if (import.meta.env.DEV) {
    handlers['plan.set'] = (request) => {
      deps.setActivePlan(request.planId);
      return { planId: deps.activePlanId() };
    };
  }

  // E2E-only conflict seed (SOU-91): `__CS_E2E__` is true ONLY in the
  // `--mode e2e` build (electron.vite.config.ts), so this strip is dead-code in
  // release builds and the seed channel is unreachable in production — exactly
  // like the `plan.set` dev switcher above.
  if (!__CS_E2E__) {
    delete handlers['sync.test.seedConflict'];
  }

  return handlers;
}
