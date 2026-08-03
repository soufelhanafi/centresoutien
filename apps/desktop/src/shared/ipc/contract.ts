import { z } from 'zod';
import { backupIpcContract } from './backup-contract';
import { dialogIpcContract } from './dialog-contract';
import {
  subjectInputSchema,
  subjectUpdateInputSchema,
  formulaInputSchema,
  studentInputSchema,
  setStudentGuardiansInputSchema,
  parentInputSchema,
  roomInputSchema,
  groupInputSchema,
  enrollmentInputSchema,
  generateSessionsSchema,
  recordSessionAttendanceSchema,
  weeklyRecurringSessionInputSchema,
  weeklyRecurringSessionUpdateSchema,
  teacherInputSchema,
  teacherPayrollRuleInputSchema,
  closeTeacherPayrollRuleMonthSchema,
  holidayInputSchema,
  studentSubscriptionInputSchema,
  closeStudentSubscriptionMonthSchema,
  recordPaymentSchema,
  voidPaymentSchema,
  paymentRef,
  generateMonthlyInvoicesSchema,
  computeMonthlyPayrollsSchema,
  confirmMonthlyPayrollsSchema,
  payrollMonthQuerySchema,
  adminCredentialsSchema,
  changeAdminPasswordSchema,
  recoveryCodeSchema,
  resetPasswordWithRecoveryCodeSchema,
  weeklyHoursSchema,
  loginInputSchema,
  centerProfileSchema,
  PASSWORD_MAX,
  CENTER_LOGO_PATH_MAX,
  TEACHER_PAYOUT_STATUSES,
  TEACHER_PAYROLL_RULE_KINDS,
} from '@centresoutien/domain';

/** The center profile as it crosses the IPC boundary — envelope dates stay in main. */
const centerDto = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  email: z.string(),
  logoPath: z.string().nullable(),
  plan: z.enum(['essentiel', 'pro', 'premium']),
});

// The presentation projection of a Student across the IPC boundary — most of the
// sync envelope (deviceOrigin, updatedBy…) is stripped and Dates are serialized
// to strings, exactly like `centerDto`. `archived` is derived from
// `deletedAt != null` in main; the renderer never sees the raw entity. This is
// the single source of truth for the renderer's `StudentView` type.
//
// `version` is the one envelope field deliberately kept, unlike every other view
// in this file: `student.setGuardians` (SOU-116) is an optimistic-concurrency
// partial update, and the caller must round-trip the version it last saw so a
// stale write is rejected instead of silently applied.
const studentViewSchema = z.object({
  id: z.string(),
  name: z.object({ fr: z.string(), ar: z.string() }),
  birthDate: z.string(),
  level: z.string(),
  school: z.string().nullable(),
  notes: z.string().nullable(),
  guardianIds: z.array(z.string()),
  archived: z.boolean(),
  createdAt: z.string(),
  version: z.number().int(),
});

// The presentation projection of a Parent/guardian across the IPC boundary — the
// sync envelope (version, deviceOrigin, updatedBy…) is stripped and Dates are
// serialized to strings, exactly like `studentViewSchema`. `archived` is derived
// from `deletedAt != null` in main; the renderer never sees the raw entity. This
// is the single source of truth for the renderer's `ParentView` type.
const parentViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  relation: z.enum(['pere', 'mere', 'tuteur', 'autre']),
  whatsappOptIn: z.boolean(),
  archived: z.boolean(),
  createdAt: z.string(),
});

// The presentation projection of a Room across the IPC boundary — the sync
// envelope (version, deviceOrigin, updatedBy…) is stripped and Dates serialized,
// exactly like `studentViewSchema`. `archived` is derived from `deletedAt != null`
// in main; the renderer never sees the raw entity. Single source of truth for the
// renderer's `RoomView` type.
const roomViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number().int(),
  archived: z.boolean(),
  createdAt: z.string(),
});

// The presentation projection of a Group across the IPC boundary — the sync
// envelope (version, deviceOrigin, updatedBy…) is stripped and Dates serialized,
// exactly like `roomViewSchema`. `archived` is derived from `deletedAt != null` in
// main; `active` (a not-yet-read domain flag) never crosses the boundary.
// `teacherId` is nullable (a group may exist before a teacher is assigned). Single
// source of truth for the renderer's `GroupView` type.
const groupViewSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  teacherId: z.string().nullable(),
  roomId: z.string(),
  level: z.string(),
  capacity: z.number().int(),
  kind: z.enum(['regular', 'exam-prep']),
  archived: z.boolean(),
  createdAt: z.string(),
});

// The group list enriched with its live enrollment count (SOU-127) — `groupView`
// plus `enrolledCount`, so the list screen renders fill % = enrolledCount /
// capacity without one IPC call per row. A sibling of `groupViewSchema` rather than
// a field on it, so the group mutation responses (create/update/archive/restore)
// keep the lean shape and only the list pays for the count query. Single source of
// truth for the renderer's `GroupWithCountView` type.
const groupWithCountViewSchema = groupViewSchema.extend({
  enrolledCount: z.number().int().nonnegative(),
});

// One row of a group's roster across the IPC boundary (SOU-127): the enrollment id
// (what the detail screen's unenroll action needs) plus the student resolved to a
// display name. Envelope-free — it is a read-model row, not an entity. Single source
// of truth for the renderer's `GroupRosterEntryView` type.
const groupRosterEntrySchema = z.object({
  enrollmentId: z.string(),
  studentId: z.string(),
  name: z.object({ fr: z.string(), ar: z.string() }),
  level: z.string(),
  startMonth: z.string(),
});

// The presentation projection of a StudentSubscription across the IPC boundary — the
// sync envelope (version, deviceOrigin, updatedBy…) is stripped and Dates serialized,
// exactly like `groupViewSchema`. There is NO stored status: the renderer derives
// active/closed from `endMonth` (null = open-ended/active) against the current month.
// `archived` is derived from `deletedAt != null` in main. `subjectIds` is the frozen
// snapshot of the formula's subjects. Single source of truth for the renderer's
// `SubscriptionView` type.
const subscriptionViewSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  formulaId: z.string(),
  kind: z.enum(['regular', 'exam-prep']),
  subjectIds: z.array(z.string()),
  startMonth: z.string(),
  endMonth: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.string(),
});

// The presentation projection of a Payment across the IPC boundary (SOU-93) — the
// sync envelope (version, deviceOrigin, updatedBy…) is stripped and Dates serialized.
// A `payment` row has `reversesPaymentId: null`; a `reversal` row references the payment
// it voids. `amountMad` is non-negative integer centimes for both kinds (reversals
// subtract in the derivation, they are not stored negative). Single source of truth for
// the renderer's `PaymentView` type.
const paymentViewSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  kind: z.enum(['payment', 'reversal']),
  amountMad: z.number().int().nonnegative(),
  method: z.enum(['cash', 'cheque', 'transfer', 'other']),
  paidOn: z.string(),
  reversesPaymentId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

// The derived payment status of an invoice (SOU-93) — never stored, always a function
// of the append-only payment ledger. Reused by the record + summary responses.
const paymentStatusSchema = z.enum(['unpaid', 'partially-paid', 'paid']);

// The invoice payment summary across the IPC boundary (SOU-93): the total, the net paid,
// the outstanding balance, the derived status, and the ledger — everything the invoice
// view / cash desk needs to show paid-ness without a stored scalar. Single source of
// truth for the renderer's `InvoicePaymentSummaryView` type.
const invoicePaymentSummarySchema = z.object({
  invoiceId: z.string(),
  totalMad: z.number().int(),
  netPaidMad: z.number().int(),
  outstandingMad: z.number().int().nonnegative(),
  status: paymentStatusSchema,
  payments: z.array(paymentViewSchema),
});

// The presentation projection of a Teacher across the IPC boundary — the sync
// envelope (version, deviceOrigin, updatedBy…) is stripped and Dates serialized,
// exactly like `parentViewSchema`. `name` is bilingual; `cin`/`email` are
// nullable; `subjectIds` is the "subjects taught" link. `archived` is derived from
// `deletedAt != null` in main; the renderer never sees the raw entity. Single
// source of truth for the renderer's `TeacherView` type.
const teacherViewSchema = z.object({
  id: z.string(),
  name: z.object({ fr: z.string(), ar: z.string() }),
  cin: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  subjectIds: z.array(z.string()),
  archived: z.boolean(),
  createdAt: z.string(),
});

// One row of the global command-palette search (SOU-43): the matched person's own
// boundary DTO tagged with its entity kind, so the renderer can group results and
// resolve the detail route without a second lookup. Single source of truth for the
// renderer's `PersonSearchResultView` type.
const personSearchResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('student'), person: studentViewSchema }),
  z.object({ kind: z.literal('teacher'), person: teacherViewSchema }),
  z.object({ kind: z.literal('parent'), person: parentViewSchema }),
]);

// The presentation projection of a TeacherPayrollRule across the IPC boundary
// (SOU-72) — the sync envelope is stripped, exactly like `teacherViewSchema`.
// There is NO stored status: the renderer derives active/history from
// `endMonth` (`null` = the one live open-ended rule = Active; set = History).
// A discriminated union on `kind` mirrors the domain entity, so `amountMad`
// and `percent` are mutually exclusive at the type level on the renderer side
// too. Single source of truth for the renderer's `TeacherPayrollRuleView` type.
const teacherPayrollRuleViewSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    teacherId: z.string(),
    kind: z.literal('fixed-monthly'),
    amountMad: z.number().int(),
    startMonth: z.string(),
    endMonth: z.string().nullable(),
  }),
  z.object({
    id: z.string(),
    teacherId: z.string(),
    kind: z.literal('percentage-of-monthly-fees'),
    percent: z.number(),
    startMonth: z.string(),
    endMonth: z.string().nullable(),
  }),
]);

// The presentation projection of a TeacherPayout across the IPC boundary
// (SOU-76) — the sync envelope is stripped, exactly like `teacherViewSchema`.
// `ruleKind`/`baseAmountMad`/`percentSnapshot` mirror what `TeacherPayout`
// itself snapshots at compute time; `baseAmountMad`/`percentSnapshot` are
// `null` for `fixed-monthly` payouts. Single source of truth for the
// renderer's `TeacherPayoutView` type (the payroll dashboard's list row).
const teacherPayoutViewSchema = z.object({
  id: z.string(),
  teacherId: z.string(),
  month: z.string(),
  ruleKind: z.enum(TEACHER_PAYROLL_RULE_KINDS),
  amountMad: z.number().int(),
  baseAmountMad: z.number().int().nullable(),
  percentSnapshot: z.number().nullable(),
  status: z.enum(TEACHER_PAYOUT_STATUSES),
  notes: z.string().nullable(),
});

// One teacher's attributed amount for one subject, for a given month — the
// payroll dashboard's per-teacher drill-down (SOU-76). Flat rows rather than
// nested-by-teacher, so the renderer groups client-side however the
// drill-down panel needs (the whole month's breakdown is fetched once, not
// once per expanded row).
const teacherAttributionBreakdownEntrySchema = z.object({
  teacherId: z.string(),
  subjectId: z.string(),
  amountMad: z.number().int(),
});

// The presentation projection of a Holiday across the IPC boundary — the sync
// envelope (version, deviceOrigin, updatedBy…) is stripped and Dates serialized,
// exactly like `roomViewSchema`. `archived` is derived from `deletedAt != null` in
// main; `affectsInvoicing` never crosses the boundary (it is an always-false domain
// invariant). Single source of truth for the renderer's `HolidayView` type.
const holidayViewSchema = z.object({
  id: z.string(),
  name: z.object({ fr: z.string(), ar: z.string() }),
  kind: z.enum(['fixed', 'lunar']),
  startDate: z.string(),
  endDate: z.string(),
  archived: z.boolean(),
  createdAt: z.string(),
});

// The presentation projection of a weekly recurring session across the IPC
// boundary — the enriched planner read model (SOU-118), aligned field-for-field
// with the domain `WeeklySessionView`. The sync envelope is stripped; there are no
// Dates (times are wall-clock `'HH:mm'` strings). The join-derived fields degrade
// to their neutral fallback rather than dropping the row:
//   - roomName / teacherName: null when the room/teacher is unassigned, archived,
//     or not-yet-synced. teacherName is bilingual so AR-RTL renders native Arabic.
//   - groupId / subjectId / subjectName / level: null when the session has no group
//     or the group is archived. subjectName is also null (while subjectId stays set)
//     when the subject itself is archived — the grid can still colour by id.
//   - kind: 'regular' fallback when there is no live group, so the badge/filter
//     always has a value.
// Single source of truth for the renderer's `WeeklySessionView` type.
const bilingualTextSchema = z.object({ fr: z.string(), ar: z.string() });

// The invoice lifecycle status (SOU-67: draft -> issued -> cancelled), shared by
// the list/detail read model and the issue/cancel transition responses (SOU-143)
// so both sides of the boundary read it off one definition.
const invoiceStatusSchema = z.enum(['draft', 'issued', 'cancelled']);

// One line of the invoice list/detail read model (SOU-69) — the frozen billed
// snapshot (bilingual label, kind, amount), envelope stripped like every other
// view. Mirrors `invoiceLineSnapshotSchema`'s shape but is a read DTO, not an
// input schema (no formula-id-prefix `.refine`).
const invoiceLineViewSchema = z.object({
  id: z.string(),
  formulaId: z.string(),
  label: bilingualTextSchema,
  kind: z.enum(['regular', 'exam-prep']),
  amountMad: z.number().int().nonnegative(),
});

// The invoice list/detail read model across the IPC boundary (SOU-69): the
// header (envelope stripped, dates serialized), its lines, and the same
// total/netPaid/outstanding/derived-status shape as `invoicePaymentSummarySchema`
// — one call backs both the filterable list screen and a single-invoice detail
// fetch (`invoice.list` with `invoiceId` set). Cancelled invoices are included,
// never hidden; the renderer badges them by `status`. Single source of truth
// for the renderer's `InvoiceListItemView` type.
const invoiceListItemViewSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  month: z.string(),
  status: invoiceStatusSchema,
  issuedAt: z.string().nullable(),
  lines: z.array(invoiceLineViewSchema),
  totalMad: z.number().int(),
  netPaidMad: z.number().int(),
  outstandingMad: z.number().int().nonnegative(),
  paymentStatus: paymentStatusSchema,
});

// The result of an issue/cancel transition (SOU-143). The renderer does a
// write-then-read-back via `invoice.list` (same pattern as recordPayment) to
// refresh the full detail view, so this DTO is a validated ack, not the source
// of the renderer's patched row.
const invoiceTransitionResultSchema = z.object({
  id: z.string(),
  status: invoiceStatusSchema,
  issuedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
});

// The Impayés (arrears) read model across the IPC boundary (SOU-103). Only the
// two derived statuses that can ever be overdue — a `paid` invoice is never
// arrears by definition, so this is a strict subset of `paymentStatusSchema`.
const overdueStatusFilterSchema = z.enum(['unpaid', 'partially-paid']);

// The 30/60/90-day aging tiers `ListOverdueInvoices` computes from the invoice's
// implicit due date (its billing month's last day) — boundaries fall in the
// closing bucket (exactly 90 days is `61-90`).
const agingBucketSchema = z.enum(['0-30', '31-60', '61-90', '90-plus']);

// One overdue invoice under a guardian's follow-up group — `invoiceId` is the
// only id the "open invoice" / "record payment" quick actions need; both reuse
// the existing `invoice.list` (with `invoiceId`) and `payment.summary` channels,
// so this ticket adds no new navigation DTO beyond the id.
const overdueInvoiceEntryViewSchema = z.object({
  invoiceId: z.string(),
  studentId: z.string(),
  studentName: bilingualTextSchema.nullable(),
  month: z.string(),
  outstandingMad: z.number().int().nonnegative(),
  daysOverdue: z.number().int().nonnegative(),
  monthsOverdue: z.number().int().nonnegative(),
  agingBucket: agingBucketSchema,
  status: overdueStatusFilterSchema,
});

// One guardian's follow-up group (SOU-103). `parentId`/`parentName`/`parentPhone`
// are `null` only for a student with no linked guardian yet — the debt still
// surfaces rather than being dropped. A student with two linked guardians
// appears once under EACH guardian's group (both get called); `totalOutstandingMad`
// is per-group, so the same invoice's amount legitimately counts under both.
const overdueParentGroupViewSchema = z.object({
  parentId: z.string().nullable(),
  parentName: z.string().nullable(),
  parentPhone: z.string().nullable(),
  totalOutstandingMad: z.number().int().nonnegative(),
  invoices: z.array(overdueInvoiceEntryViewSchema),
});

// The center-wide aging summary (SOU-103), computed from the DEDUPLICATED
// invoice set — a shared debt fanned out to two guardians is counted once here,
// even though it appears in two `overdueParentGroupViewSchema` groups above.
const agingSummaryEntryViewSchema = z.object({
  bucket: agingBucketSchema,
  count: z.number().int().nonnegative(),
  outstandingMad: z.number().int().nonnegative(),
});

const weeklySessionViewSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  start: z.string(),
  end: z.string(),
  roomId: z.string(),
  roomName: z.string().nullable(),
  teacherId: z.string().nullable(),
  teacherName: bilingualTextSchema.nullable(),
  groupId: z.string().nullable(),
  subjectId: z.string().nullable(),
  subjectName: bilingualTextSchema.nullable(),
  level: z.string().nullable(),
  kind: z.enum(['regular', 'exam-prep']),
});

// The schedule PDF export's view scope (SOU-107): `full` prints every live
// session; the other three narrow to one room/teacher/group and carry BOTH the
// target id (so the main process can filter the already-fetched
// `session.week` rows by it) AND its already-known display name/level — the
// renderer already holds these for its own filter dropdowns, so the main
// process resolves nothing beyond filtering, mirroring `session.week`'s own
// "filtering is client-side" design note (`ListWeekSessions`'s doc comment).
const scheduleExportViewFilterSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('full') }),
  z.object({ scope: z.literal('room'), roomId: z.string(), roomName: z.string() }),
  z.object({ scope: z.literal('teacher'), teacherId: z.string(), teacherName: bilingualTextSchema }),
  z.object({
    scope: z.literal('group'),
    groupId: z.string(),
    subjectName: bilingualTextSchema.nullable(),
    level: z.string().nullable(),
  }),
]);

// The presentation projection of a concrete, dated session occurrence across the
// IPC boundary (SOU-129) — the sync envelope is stripped and the branded id /
// `TimeOfDay` values widened to plain strings. `teacherId` is nullable (inherited
// from the template, which may have no teacher). `date` is a `YYYY-MM-DD` civil
// date; `start`/`end` are `'HH:mm'` wall-clock strings, not timestamps. Single
// source of truth for the renderer's `SessionView` type.
const sessionViewSchema = z.object({
  id: z.string(),
  recurringSessionId: z.string(),
  roomId: z.string(),
  teacherId: z.string().nullable(),
  date: z.string(),
  start: z.string(),
  end: z.string(),
});

// The presentation projection of one roll-call outcome across the IPC boundary
// (SOU-58) — the sync envelope is stripped. `note` is deliberately absent: it is
// out of scope for the batched roll-call ticket (KICKOFF), so every record this
// channel returns has `note: null` in the domain and the renderer has no field
// to show yet. Single source of truth for the renderer's `AttendanceRecordView`
// type.
const attendanceRecordViewSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  studentId: z.string(),
  status: z.enum(['present', 'absent', 'excused', 'late']),
});

// The Basique dashboard's three KPI cards across the IPC boundary (SOU-100) —
// already a plain read model, no envelope to strip. Single source of truth for
// the renderer's `DashboardBasicSummaryView` type.
const dashboardBasicSummarySchema = z.object({
  todaysSessionCount: z.number().int().nonnegative(),
  activeStudentCount: z.number().int().nonnegative(),
  unpaidInvoiceCount: z.number().int().nonnegative(),
});

// The Avancé dashboard's four widgets across the IPC boundary (SOU-100),
// gated by `dashboard.advanced` (Premium) in the domain use case. `month` is
// `'YYYY-MM'`; `revenueTrend`/`enrollmentEvolution` are oldest-first over the
// same trailing window. Single source of truth for the renderer's
// `DashboardAdvancedSummaryView` type.
const dashboardAdvancedSummarySchema = z.object({
  revenueTrend: z.array(z.object({ month: z.string(), collectedMad: z.number().int() })),
  enrollmentEvolution: z.array(
    z.object({ month: z.string(), activeStudentCount: z.number().int().nonnegative() }),
  ),
  attendanceRatePercent: z.number().int().min(0).max(100),
  subjectRevenueBreakdown: z.array(
    z.object({
      subjectId: z.string(),
      subjectName: bilingualTextSchema,
      amountMad: z.number().int().nonnegative(),
    }),
  ),
});

// The presentation projection of a Subject across the IPC boundary (SOU-124) — the
// sync envelope (version, deviceOrigin, updatedBy…, and the Date timestamps) is
// stripped, leaving only the fields name-resolution and the pickers need. `code` is
// nullable (a subject may have none). `active` is the real domain flag (distinct
// from the soft-delete tombstone, which is excluded from these reads entirely).
// Single source of truth for the renderer's `SubjectView` type.
const subjectViewSchema = z.object({
  id: z.string(),
  name: z.object({ fr: z.string(), ar: z.string() }),
  code: z.string().nullable(),
  active: z.boolean(),
});

// One entity referencing a subject, named for the delete-blocked modal (SOU-135):
// "impossible de supprimer : utilisé par le groupe 3ème A" instead of a bare count.
// `kind` is open to `'formula'`/`'session'` ahead of those entities actually
// referencing subjects (only `'group'` has live data today — SOU-60 and friends
// add the rest). `label` is bilingual; for a `'group'` reference the domain
// duplicates the group's plain `level` string into both `fr` and `ar` since a
// Group has no translated name of its own.
const subjectUsageReferenceSchema = z.object({
  kind: z.enum(['group', 'formula', 'session']),
  id: z.string(),
  label: z.object({ fr: z.string(), ar: z.string() }),
});

// A subject paired with its in-use reference count across the boundary (SOU-124),
// backing the SOU-47 CRUD table: the lean `subjectView` plus `inUseCount` and the
// derived `canDelete` (`inUseCount === 0`) so a row can enable/disable its archive
// action without a second round-trip. A sibling of `subjectViewSchema` rather than a
// field on it, so the name channels stay lean and only the CRUD screen pays for the
// counts. `references` (SOU-135) is the named breakdown behind `inUseCount` — always
// the same length — so the delete-blocked modal can list what's blocking a delete
// instead of just disabling the button. Single source of truth for the renderer's
// `SubjectUsageView` type.
const subjectUsageViewSchema = z.object({
  subject: subjectViewSchema,
  inUseCount: z.number().int().nonnegative(),
  canDelete: z.boolean(),
  references: z.array(subjectUsageReferenceSchema),
});

// The presentation projection of a Formula across the IPC boundary (SOU-62) — the
// sync envelope (version, deviceOrigin, updatedBy…, and the Date timestamps) is
// stripped, exactly like `subjectViewSchema`. `isImmutable` crosses the boundary
// as-is — the CRUD table's locked badge and disabled-edit tooltip key off it
// directly. No `archived` field: this ticket's CRUD UI has no soft-delete action,
// only `active` (toggled one-way, off, via `formula.deactivate`). Single source of
// truth for the renderer's `FormulaView` type.
const formulaViewSchema = z.object({
  id: z.string(),
  name: z.object({ fr: z.string(), ar: z.string() }),
  subjectIds: z.array(z.string()),
  priceMad: z.number().int(),
  kind: z.enum(['regular', 'exam-prep']),
  isImmutable: z.boolean(),
  active: z.boolean(),
});

// The display shape of one weekday's hours returned to the renderer: the
// user-visible fields only, envelope stripped. `open`/`close` are `'HH:mm'` or
// null (closed). Reused by both centerHours responses.
const centerHoursViewSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  open: z.string().nullable(),
  close: z.string().nullable(),
});

// Kept in sync with the renderer's `LOCALES` (`renderer/i18n/direction.ts`) and
// main's `LOCALE_PREFERENCES` (`main/infra/locale-preference-store.ts`).
const localePreferenceSchema = z.enum(['fr', 'ar']);

/**
 * The typed IPC contract (SOU-15). Every renderer↔main call is a named channel
 * with a zod request AND response schema, validated on both ends. Adding a
 * method = one entry here; main provides the handler, the preload bridge and
 * renderer get their types for free.
 */
export const ipcContract = {
  'app.ping': {
    request: z.object({ message: z.string() }),
    response: z.object({ reply: z.string(), appVersion: z.string() }),
  },
  'plan.get': {
    request: z.object({}),
    response: z.object({ planId: z.enum(['essentiel', 'pro', 'premium']) }),
  },
  // Dev plan switcher (SOU) — swaps the domain's active plan so the PlanPolicy
  // gate and the renderer's cosmetic mirror stay in sync. Without it, flipping a
  // UI feature on would fire gated reads the domain still rejects.
  'plan.set': {
    request: z.object({ planId: z.enum(['essentiel', 'pro', 'premium']) }),
    response: z.object({ planId: z.enum(['essentiel', 'pro', 'premium']) }),
  },
  // The request schema is the domain's own input schema — validated once, shared
  // by the form (zodResolver), the preload types, and this boundary.
  'subject.create': {
    request: subjectInputSchema,
    response: z.object({ id: z.string() }),
  },
  // Subject archive (SOU-46): a soft delete guarded in the domain by the in-use
  // rule — a subject still referenced by an active group (later: sessions/formulas)
  // is rejected with `SubjectInUseError`. centerCode/user are injected in main,
  // never sent from the renderer. Mirrors room.archive.
  'subject.archive': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  // Subject read + update channels (SOU-124), the seam SOU-47/SOU-37 frontends
  // consume. `list` selects the active picker set or every live subject via
  // `scope` (both exclude tombstones — the axis is the `active` flag, not
  // soft-delete); `get` resolves a single subject to its view or null for an
  // unknown/archived/foreign-center id. `listWithUsage` returns each live subject
  // with its in-use count + derived `canDelete` for the CRUD table, kept separate
  // so the name channels stay lean. `update` takes the domain's own
  // `subjectUpdateInputSchema` (bilingual name + `active` toggle; `code` is NOT
  // editable — a sync natural key, SOU-122) plus the id and echoes the saved view.
  // centerCode/user are injected in main, never sent from the renderer. All gated
  // by `core.subjects` (every plan) in the use cases; reads strip the envelope to
  // `subjectViewSchema`.
  'subject.list': {
    request: z.object({ scope: z.enum(['active', 'all']) }),
    response: z.object({ subjects: z.array(subjectViewSchema) }),
  },
  'subject.get': {
    request: z.object({ id: z.string() }),
    response: z.object({ subject: subjectViewSchema.nullable() }),
  },
  'subject.listWithUsage': {
    request: z.object({}),
    response: z.object({ subjects: z.array(subjectUsageViewSchema) }),
  },
  'subject.update': {
    request: subjectUpdateInputSchema.extend({ id: z.string() }),
    response: z.object({ subject: subjectViewSchema }),
  },
  // The request is the domain's own input schema — validated once, shared by the
  // form (zodResolver), the preload types, and this boundary. centerCode/device/
  // user are injected in main, never sent from the renderer.
  'student.create': {
    request: studentInputSchema,
    response: z.object({ id: z.string() }),
  },
  // Student reads/writes (SOU-39). `list` filters by an FR/AR name-or-level search
  // (centerCode is injected in main); `get` returns the single view or null for an
  // unknown/archived id; `update` takes the domain's own input schema plus the id
  // and echoes the saved view; `archive` is a soft delete. All strip the envelope
  // to `studentViewSchema`, like the center channels.
  'student.list': {
    request: z.object({ search: z.string() }),
    response: z.object({ students: z.array(studentViewSchema) }),
  },
  'student.get': {
    request: z.object({ id: z.string() }),
    response: z.object({ student: studentViewSchema.nullable() }),
  },
  'student.update': {
    request: studentInputSchema.extend({ id: z.string() }),
    response: z.object({ student: studentViewSchema }),
  },
  // Partial-update channel (SOU-116): touches only `guardianIds` + the sync
  // envelope, never the rest of `StudentInput` — see the note on
  // `studentViewSchema`. `expectedVersion` must match the student's current
  // `version` or the write is rejected so a stale snapshot can't silently
  // revert an unrelated field.
  'student.setGuardians': {
    request: setStudentGuardiansInputSchema.extend({ id: z.string() }),
    response: z.object({ student: studentViewSchema }),
  },
  'student.archive': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  // Parents/guardians (SOU-40). Gated by `core.parents` in the use case. The
  // request is the domain's own `parentInputSchema` — phone required and
  // normalized to E.164, `relation` an enum token — validated once here and
  // reused by the form (zodResolver). centerCode/device/user are injected in
  // main, never sent from the renderer.
  'parent.create': {
    request: parentInputSchema,
    response: z.object({ id: z.string() }),
  },
  // Guardian reads/writes (SOU-41). `list` filters by a name-or-phone search
  // (centerCode is injected in main); `get` returns the single view or null for an
  // unknown/archived id; `update` takes the domain's own input schema plus the id
  // and echoes the saved view; `archive` is a soft delete; `children` returns the
  // guardian's linked students (as `studentViewSchema`) for the detail sheet. All
  // strip the envelope, like the student channels.
  'parent.list': {
    request: z.object({ search: z.string() }),
    response: z.object({ parents: z.array(parentViewSchema) }),
  },
  'parent.get': {
    request: z.object({ id: z.string() }),
    response: z.object({ parent: parentViewSchema.nullable() }),
  },
  'parent.update': {
    request: parentInputSchema.extend({ id: z.string() }),
    response: z.object({ parent: parentViewSchema }),
  },
  'parent.archive': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'parent.children': {
    request: z.object({ id: z.string() }),
    response: z.object({ students: z.array(studentViewSchema) }),
  },
  // Rooms (SOU-33). `list` selects the live rooms or the archive via `scope`;
  // `create` and `update` take the domain's own `roomInputSchema` (capacity ≥ 1),
  // validated once and reused by the form (zodResolver); `archive` is a soft
  // delete; `restore` clears the tombstone. centerCode/device/user are injected in
  // main, never sent from the renderer. All reads strip the envelope to
  // `roomViewSchema`, like the student channels.
  'room.list': {
    request: z.object({ scope: z.enum(['active', 'archived']) }),
    response: z.object({ rooms: z.array(roomViewSchema) }),
  },
  'room.create': {
    request: roomInputSchema,
    response: z.object({ id: z.string() }),
  },
  'room.update': {
    request: roomInputSchema.extend({ id: z.string() }),
    response: z.object({ room: roomViewSchema }),
  },
  'room.archive': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'room.restore': {
    request: z.object({ id: z.string() }),
    response: z.object({ room: roomViewSchema }),
  },
  // Groups (SOU-120), mirroring the room.* contract. `list` selects the live
  // groups or the archive via `scope`; `create` and `update` take the domain's own
  // `groupInputSchema` (capacity ≥ 1, kind regular|exam-prep, prefixed subject/room
  // ids), validated once and reused by the future group form (zodResolver);
  // `archive` is a soft delete; `restore` clears the tombstone. centerCode/device/
  // user are injected in main, never sent from the renderer. Gated by `core.groups`
  // (every plan) in the use cases; exam-prep additionally needs `core.exam-prep`
  // (Pro+). All reads strip the envelope to `groupViewSchema`.
  'group.list': {
    request: z.object({ scope: z.enum(['active', 'archived']) }),
    response: z.object({ groups: z.array(groupViewSchema) }),
  },
  'group.create': {
    request: groupInputSchema,
    response: z.object({ id: z.string() }),
  },
  'group.update': {
    request: groupInputSchema.extend({ id: z.string() }),
    response: z.object({ group: groupViewSchema }),
  },
  'group.archive': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'group.restore': {
    request: z.object({ id: z.string() }),
    response: z.object({ group: groupViewSchema }),
  },
  // Group roster + counts read model (SOU-127), backing the SOU-50 detail/list UI.
  // `listWithCounts` mirrors `group.list`'s `scope` request but returns each group
  // with its live `enrolledCount` (one batch count query, never N+1) so the list can
  // show fill %. `roster` returns a single group's active enrolled students resolved
  // to names for the detail screen. centerCode is injected in main, never sent from
  // the renderer. Both gated by `core.groups` (every plan) in the use cases.
  'group.listWithCounts': {
    request: z.object({ scope: z.enum(['active', 'archived']) }),
    response: z.object({ groups: z.array(groupWithCountViewSchema) }),
  },
  'group.roster': {
    request: z.object({ groupId: z.string() }),
    response: z.object({ roster: z.array(groupRosterEntrySchema) }),
  },
  // Formula CRUD (SOU-62), mirroring `subject.*`. `create`/`update` share the
  // domain's own `formulaInputSchema` (bilingual name, subjectIds, priceMad, kind)
  // — `active` is NOT part of it; the only path that ever writes `active` is
  // `formula.deactivate`. `list` selects the active picker set or every live
  // formula via `scope`; `get` resolves a single formula to its view or null.
  // `clone` ("dupliquer") copies an existing formula into a fresh, mutable,
  // active one — the prescribed move for a price/subject change on an immutable
  // (already-billed) formula. `deactivate` sets `active: false` even on an
  // immutable formula, bypassing the update path's `FormulaImmutableError`
  // guard — the CRUD UI wires its single "deactivate" action here regardless of
  // lock state. centerCode/device/user are injected in main, never sent from the
  // renderer. All gated by `core.formulas` (every plan); an exam-prep `kind`
  // additionally needs `core.exam-prep` (Pro+). Reads strip the envelope to
  // `formulaViewSchema`.
  'formula.create': {
    request: formulaInputSchema,
    response: z.object({ id: z.string() }),
  },
  'formula.list': {
    request: z.object({ scope: z.enum(['active', 'all']) }),
    response: z.object({ formulas: z.array(formulaViewSchema) }),
  },
  'formula.get': {
    request: z.object({ id: z.string() }),
    response: z.object({ formula: formulaViewSchema.nullable() }),
  },
  'formula.update': {
    request: formulaInputSchema.extend({ id: z.string() }),
    response: z.object({ formula: formulaViewSchema }),
  },
  'formula.clone': {
    request: z.object({ id: z.string() }),
    response: z.object({ id: z.string() }),
  },
  'formula.deactivate': {
    request: z.object({ id: z.string() }),
    response: z.object({ formula: formulaViewSchema }),
  },
  // Student subscriptions (SOU-63) — the formula-billing surface. `create` takes the
  // domain's own `studentSubscriptionInputSchema` (prefixed student/formula/subject
  // ids, kind, a non-empty subjectIds snapshot, YYYY-MM start with optional end),
  // validated once and reused by the future subscription form (zodResolver); `close`
  // caps a live subscription's `endMonth` (the close half of close-and-reopen); `list`
  // returns a student's live subscriptions (both tracks). centerCode/device/user are
  // injected in main, never sent from the renderer. Gated by `core.formulas` (every
  // plan) in the use cases; exam-prep additionally needs `core.exam-prep` (Pro+). All
  // reads strip the envelope to `subscriptionViewSchema`; status is derived, not stored.
  'subscription.create': {
    request: studentSubscriptionInputSchema,
    response: z.object({ id: z.string() }),
  },
  'subscription.close': {
    request: z.object({ subscriptionId: z.string(), endMonth: closeStudentSubscriptionMonthSchema }),
    response: z.object({ subscription: subscriptionViewSchema }),
  },
  'subscription.replace': {
    request: studentSubscriptionInputSchema.extend({ activeSubscriptionId: z.string() }),
    response: z.object({
      closed: subscriptionViewSchema,
      created: subscriptionViewSchema,
    }),
  },
  'subscription.list': {
    request: z.object({ studentId: z.string() }),
    response: z.object({ subscriptions: z.array(subscriptionViewSchema) }),
  },
  // Payments (SOU-93) — the append-only money ledger; Payment capture UI is SOU-101,
  // the duplicates/conflict tab is SOU-91. `record` takes the domain's own
  // `recordPaymentSchema` (prefixed invoice id, positive integer amountMad, method
  // enum, real paidOn date) and appends a `payment` row, returning the new id and the
  // freshly DERIVED status; a below-balance amount needs `core.invoicing.partial-paid`
  // (Pro+), enforced in the use case. `void` appends a `reversal` for a payment
  // (never a DELETE/UPDATE), returning the reversal's id. `summary` returns the
  // invoice total, net paid, outstanding, derived status, and the ledger — the seam
  // SOU-67 deferred (status is derived, never stored). centerCode/device/user are
  // injected in main, never sent from the renderer. Gated by `core.invoicing`.
  'payment.record': {
    request: recordPaymentSchema,
    response: z.object({ id: z.string(), status: paymentStatusSchema }),
  },
  'payment.void': {
    request: voidPaymentSchema,
    response: z.object({ id: z.string() }),
  },
  'payment.summary': {
    request: z.object({ invoiceId: z.string() }),
    response: invoicePaymentSummarySchema,
  },
  // Payment receipt print/export (SOU-101). Renders a single ledger row (a
  // `payment` or a `reversal`) to the same bilingual FR/AR `pdf-lib` layout
  // family as the invoice and payslip PDFs. `print` opens it in the OS's
  // default PDF viewer; `export` lets the user pick a save location. `locale`
  // picks the PDF's language independent of the app's active UI locale,
  // mirroring `invoice.print`/`invoice.export`. centerCode is injected in
  // main, never sent from the renderer. Gated by `core.invoicing` (every plan).
  'payment.receipt.print': {
    request: z.object({ paymentId: paymentRef, locale: z.enum(['fr', 'ar']) }),
    response: z.object({ ok: z.literal(true) }),
  },
  'payment.receipt.export': {
    request: z.object({ paymentId: paymentRef, locale: z.enum(['fr', 'ar']) }),
    response: z.object({ savedPath: z.string().nullable() }),
  },
  // Monthly invoice generation job (SOU-68) — the first wired caller of
  // `CreateInvoiceDraft` (SOU-67 shipped it unwired). For every student with a
  // live `StudentSubscription` active in `month`, creates one draft invoice with
  // one line per active subscription (a student on both a regular and an
  // exam-prep formula gets both lines on the same invoice). Idempotent: re-running
  // for an already-generated month produces zero new drafts — `created` is the
  // count of newly-drafted invoices, `skipped` the count of already-billed
  // students, both derived from `CreateInvoiceDraft`'s own duplicate guard, not a
  // separate check; `unresolved` counts students whose subscription(s) pointed at
  // a formula that couldn't be resolved (defensive — not reachable through any
  // shipped use case today) and so got no invoice at all. `issue`/`cancel`
  // channels remain out of scope (KICKOFF, SOU-69). centerCode/device/
  // user are injected in main, never sent from the renderer. Gated by
  // `core.invoicing` (every plan).
  'invoice.generateMonthly': {
    request: generateMonthlyInvoicesSchema,
    response: z.object({
      created: z.number().int(),
      skipped: z.number().int(),
      unresolved: z.number().int(),
    }),
  },
  // Invoice list/detail/print/export (SOU-69). `list` returns every live invoice
  // matching the optional structural filters (`month` / `studentId`) plus the
  // derived `paymentStatus` filter (unpaid/partially-paid/paid — NOT the
  // lifecycle `status`, which is never filtered, only badged); passing
  // `invoiceId` alone resolves the single-invoice detail fetch. Cancelled
  // invoices are included, never hidden. `print` renders the same `pdf-lib`
  // document as `export` (KICKOFF: never `printToPDF`) and opens it in the
  // OS's default PDF viewer; `export` lets the user pick a save location and
  // returns the chosen path, or null if the save dialog was cancelled.
  // `locale` picks the PDF's language/direction — independent of the app's
  // active UI locale, since a center may want to print a French copy while
  // running the app in Arabic (or vice versa). centerCode is injected in
  // main, never sent from the renderer. Gated by `core.invoicing`.
  'invoice.list': {
    request: z.object({
      month: z.string().optional(),
      studentId: z.string().optional(),
      invoiceId: z.string().optional(),
      paymentStatus: paymentStatusSchema.optional(),
    }),
    response: z.object({ invoices: z.array(invoiceListItemViewSchema) }),
  },
  'invoice.print': {
    request: z.object({ invoiceId: z.string(), locale: z.enum(['fr', 'ar']) }),
    response: z.object({ ok: z.literal(true) }),
  },
  'invoice.export': {
    request: z.object({ invoiceId: z.string(), locale: z.enum(['fr', 'ar']) }),
    response: z.object({ savedPath: z.string().nullable() }),
  },
  // Issue / cancel (SOU-143) — the two lifecycle transitions `IssueInvoice`/
  // `CancelInvoice` (domain, pre-dating SOU-69) already implement; this ticket
  // only wires them to IPC. `issue` moves draft -> issued; `cancel` moves
  // draft|issued -> cancelled (discard or void) — both terminal moves the domain
  // rejects with `InvalidInvoiceTransitionError` off the wrong source state, and
  // an unknown/foreign-center id with `InvoiceNotFoundError`. Neither touches the
  // frozen lines. centerCode/updatedBy are injected in main, never sent from the
  // renderer. Gated by `core.invoicing` (every plan) in the use cases.
  'invoice.issue': {
    request: z.object({ invoiceId: z.string() }),
    response: invoiceTransitionResultSchema,
  },
  'invoice.cancel': {
    request: z.object({ invoiceId: z.string() }),
    response: invoiceTransitionResultSchema,
  },
  // Impayés (arrears) list (SOU-103): every `issued` invoice that is both past its
  // implicit due date (its billing month's last day) and not fully paid, grouped by
  // guardian for phone follow-up rounds, plus a 30/60/90-day aging summary — derived
  // exclusively from the invoice + payment + student read surface, no separate
  // "arrears" state. Filters are all optional and compose: `month` (exact billing
  // month), `minOutstandingMad`/`maxOutstandingMad` (centimes), `groupId` (the
  // student's currently live-enrolled group), `status` (unpaid/partially-paid — a
  // narrower enum than `paymentStatusSchema` since `paid` is never overdue). The
  // "open invoice" and "record payment" quick actions reuse the existing
  // `invoice.list` (with `invoiceId`) and `payment.summary`/`payment.record`
  // channels — this ticket adds no new write path. centerCode is injected in main,
  // never sent from the renderer. Gated by `core.invoicing` (every plan).
  'invoice.overdue': {
    request: z.object({
      month: z.string().optional(),
      minOutstandingMad: z.number().int().nonnegative().optional(),
      maxOutstandingMad: z.number().int().nonnegative().optional(),
      groupId: z.string().optional(),
      status: overdueStatusFilterSchema.optional(),
    }),
    response: z.object({
      groups: z.array(overdueParentGroupViewSchema),
      agingSummary: z.array(agingSummaryEntryViewSchema),
    }),
  },
  // Payslip PDF print/export (SOU-75). Renders the confirmed `TeacherPayout`
  // (draft or paid — stateless, printing never mutates the payout) to the same
  // bilingual FR/AR `pdf-lib` layout family as the invoice PDF. `print` opens it
  // in the OS's default PDF viewer; `export` lets the user pick a save
  // location. `locale` picks the PDF's language independent of the app's active
  // UI locale, mirroring `invoice.print`/`invoice.export`. centerCode is
  // injected in main, never sent from the renderer. Gated by `payroll.teacher`
  // (Pro+) in `GeneratePayslipPdf`.
  'payslip.print': {
    request: z.object({ teacherPayoutId: z.string(), locale: z.enum(['fr', 'ar']) }),
    response: z.object({ ok: z.literal(true) }),
  },
  'payslip.export': {
    request: z.object({ teacherPayoutId: z.string(), locale: z.enum(['fr', 'ar']) }),
    response: z.object({ savedPath: z.string().nullable() }),
  },
  // Enrollments (SOU-121/123 domain; SQLite adapter + wiring is SOU-126). `create`
  // takes the domain's own `enrollmentInputSchema` (prefixed student/group ids,
  // `YYYY-MM` startMonth, optional endMonth ≥ startMonth), validated once and reused
  // by the future enrollment form (zodResolver); it runs the capacity, cross-kind,
  // duplicate, and subscription-coverage guards in the use case and returns the new
  // id. `unenroll` is a soft delete by enrollment id (freeing the seat); unlike the
  // `*.archive` channels it does NOT swallow a not-found id — the domain rejects an
  // unknown/already-unenrolled/foreign-center id so it never silently no-ops.
  // centerCode/device/user are injected in main, never sent from the renderer. Gated
  // by `core.groups` (every plan) in the use cases; exam-prep coverage additionally
  // requires an exam-prep subscription.
  'enrollment.create': {
    request: enrollmentInputSchema,
    response: z.object({ id: z.string() }),
  },
  'enrollment.unenroll': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  // Teachers (SOU-36 domain/data; CRUD UI + archive/restore is SOU-37). Gated by
  // `core.teachers` and bounded by the `maxTeachers` plan limit in the use cases.
  // `create` and `update` take the domain's own `teacherInputSchema` (phone
  // required + E.164, bilingual name, optional CIN/email, subjectIds), validated
  // once and reused by the form (zodResolver); `list` selects the live teachers or
  // the archive via `scope` (mirrors `room.list`) and filters by a name-or-phone
  // search; `get` returns the single view or null for an unknown/archived id;
  // `archive` is a soft delete (rejected by TeacherInUseError once groups/payroll
  // reference the teacher); `restore` clears the tombstone (rejected by the
  // maxTeachers cap or a live natural-key duplicate). centerCode/device/user are
  // injected in main, never sent from the renderer. All reads strip the envelope
  // to `teacherViewSchema`.
  'teacher.list': {
    request: z.object({ scope: z.enum(['active', 'archived']), search: z.string() }),
    response: z.object({ teachers: z.array(teacherViewSchema) }),
  },
  // The global command-palette search (SOU-43): a single FR/AR name query fanned
  // out across students, teachers, and live guardians, gated per entity kind by
  // `core.students` / `core.teachers` / `core.parents`, merged, and capped to the
  // top 20. centerCode is injected in main, never sent from the renderer.
  'people.search': {
    request: z.object({ query: z.string() }),
    response: z.object({ results: z.array(personSearchResultSchema) }),
  },
  'teacher.create': {
    request: teacherInputSchema,
    response: z.object({ id: z.string() }),
  },
  'teacher.get': {
    request: z.object({ id: z.string() }),
    response: z.object({ teacher: teacherViewSchema.nullable() }),
  },
  'teacher.update': {
    request: teacherInputSchema.extend({ id: z.string() }),
    response: z.object({ teacher: teacherViewSchema }),
  },
  'teacher.archive': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'teacher.restore': {
    request: z.object({ id: z.string() }),
    response: z.object({ teacher: teacherViewSchema }),
  },
  // Teacher payroll rules (SOU-72), the Rule tab's CRUD surface — `CreateTeacherPayrollRule`
  // / `CloseTeacherPayrollRule` shipped in SOU-70/71, wired to IPC here for the first
  // time. `create` takes the domain's own discriminated `teacherPayrollRuleInputSchema`
  // (fixed-monthly xor percentage-of-monthly-fees), validated once and reused by the
  // form (zodResolver); `close` caps a live rule's `endMonth` (the close half of
  // close-and-reopen — a rule change combines this with a fresh `create`); `list`
  // returns one teacher's live rules, newest start first, for the Active/History split.
  // centerCode/device/user are injected in main, never sent from the renderer. Gated by
  // `payroll.teacher` (+ `payroll.teacher.fixed`/`.percentage` on create) in the use
  // cases. All reads strip the envelope to `teacherPayrollRuleViewSchema`; status is
  // derived, never stored.
  'teacherPayrollRule.create': {
    request: teacherPayrollRuleInputSchema,
    response: z.object({ id: z.string() }),
  },
  'teacherPayrollRule.close': {
    request: z.object({ ruleId: z.string(), endMonth: closeTeacherPayrollRuleMonthSchema }),
    response: z.object({ rule: teacherPayrollRuleViewSchema }),
  },
  'teacherPayrollRule.replace': {
    request: teacherPayrollRuleInputSchema.and(z.object({ activeRuleId: z.string() })),
    response: z.object({
      closed: teacherPayrollRuleViewSchema,
      created: teacherPayrollRuleViewSchema,
    }),
  },
  'teacherPayrollRule.list': {
    request: z.object({ teacherId: z.string() }),
    response: z.object({ rules: z.array(teacherPayrollRuleViewSchema) }),
  },
  // Monthly payroll compute job (SOU-74): for every active teacher with a live
  // `TeacherPayrollRule` covering `month`, upserts a `draft` `TeacherPayout` — the
  // flat amount for `fixed-monthly`, or the equal-split attribution base (SOU-73)
  // × percent for `percentage-of-monthly-fees`. Idempotent by `(teacherId, month)`:
  // `updated` counts a re-run replacing an existing draft's amount in place,
  // `created` a first-time row; `skippedNoRule` is a teacher with no rule active
  // that month (never a zero-amount payout); `skippedAlreadyPaid` is a payout
  // already confirmed `paid`, left untouched (paid payouts are immutable).
  // Independent of attendance — never reads session data. centerCode/device/user
  // are injected in main, never sent from the renderer. Gated by `payroll.teacher`
  // (Pro+). Confirming a draft to `paid` is SOU-76, not this channel.
  'payroll.computeMonthly': {
    request: computeMonthlyPayrollsSchema,
    response: z.object({
      created: z.number().int(),
      updated: z.number().int(),
      skippedNoRule: z.number().int(),
      skippedAlreadyPaid: z.number().int(),
    }),
  },
  // Payroll dashboard (SOU-76): the month's list of payouts, one row per
  // teacher who has a live payout that month (a teacher with no rule active,
  // per `payroll.computeMonthly`'s own doc, has no row at all). centerCode is
  // injected in main, never sent from the renderer. Gated by `payroll.teacher`
  // in `ListTeacherPayouts` — the repository's own `listLiveByCenterMonth`
  // read carries no gate of its own.
  'payroll.listPayouts': {
    request: payrollMonthQuerySchema,
    response: z.object({ payouts: z.array(teacherPayoutViewSchema) }),
  },
  // "Mark paid" on a single dashboard row (SOU-76): flips one `draft` payout
  // to `paid`. Rejects (does not silently no-op) a payout that is already
  // `paid` — paid payouts are immutable — or unknown/foreign-center.
  // centerCode/updatedBy are injected in main, never sent from the renderer.
  // Gated by `payroll.teacher` in `ConfirmTeacherPayout`.
  'payroll.confirmPayout': {
    request: z.object({ teacherPayoutId: z.string() }),
    response: z.object({ payout: teacherPayoutViewSchema }),
  },
  // The dashboard's "Mark all paid" bulk action (SOU-76): confirms every live
  // `draft` payout for the month in one pass. `confirmed` counts newly-paid
  // rows; `skippedAlreadyPaid` counts rows a teammate already confirmed
  // before this run — expected in a bulk action, not an error (unlike the
  // single-row `payroll.confirmPayout`, which rejects a repeat target).
  // centerCode/updatedBy are injected in main, never sent from the renderer.
  // Gated by `payroll.teacher` in `ConfirmMonthlyPayrolls`.
  'payroll.confirmMonthly': {
    request: confirmMonthlyPayrollsSchema,
    response: z.object({
      confirmed: z.number().int(),
      skippedAlreadyPaid: z.number().int(),
    }),
  },
  // The dashboard's per-teacher drill-down (SOU-76): the whole month's
  // attribution broken down by teacher AND subject in one call — the
  // renderer groups the flat rows by `teacherId` client-side rather than
  // issuing one call per expanded row. Mirrors the same equal-split base
  // `payroll.computeMonthly`'s percentage-rule path already computes, just
  // not collapsed to a per-teacher total. centerCode is injected in main,
  // never sent from the renderer. Gated by `payroll.teacher` in
  // `GetTeacherAttributionBreakdown` — `MonthlyFeeAttributionService` itself
  // carries no gate of its own.
  'payroll.attributionBreakdown': {
    request: payrollMonthQuerySchema,
    response: z.object({ breakdown: z.array(teacherAttributionBreakdownEntrySchema) }),
  },
  // Holidays (SOU-30). `list` selects the live holidays or the archive via `scope`;
  // `create` and `update` take the domain's own `holidayInputSchema` (bilingual
  // name, kind fixed|lunar, calendar-date range with end >= start), validated once
  // and reused by the form (zodResolver); `archive` is a soft delete; `restore`
  // clears the tombstone. `holidayInputSchema` carries a superRefine, so `update`
  // composes the id with `.and(...)` rather than `.extend(...)`. centerCode/device/
  // user are injected in main, never sent from the renderer. Gated by
  // `settings.holidays` (every plan since SOU-30) in the use cases.
  'holiday.list': {
    request: z.object({ scope: z.enum(['active', 'archived']) }),
    response: z.object({ holidays: z.array(holidayViewSchema) }),
  },
  'holiday.create': {
    request: holidayInputSchema,
    response: z.object({ id: z.string() }),
  },
  'holiday.update': {
    request: holidayInputSchema.and(z.object({ id: z.string() })),
    response: z.object({ holiday: holidayViewSchema }),
  },
  'holiday.archive': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'holiday.restore': {
    request: z.object({ id: z.string() }),
    response: z.object({ holiday: holidayViewSchema }),
  },
  // Weekly recurring sessions (SOU-53 seam → SOU-54 planner grid). `session.week`
  // returns every live session of the center for all seven weekdays, ordered by
  // weekday then start time (the repository port's contract). centerCode is
  // injected in main, never sent from the renderer — same rule as `room.list`.
  // Filtering (teacher/room/level) is applied client-side in the grid for now.
  'session.week': {
    request: z.object({}),
    response: z.object({ sessions: z.array(weeklySessionViewSchema) }),
  },
  // Materialize concrete dated sessions from a recurrence template (SOU-129;
  // domain use case SOU-56 + this ticket's persistence seam). The request is the
  // domain's own `generateSessionsSchema` (prefixed `wrs_` id, strict YYYY-MM-DD
  // `from`/`to` with `to >= from`), validated once and reused by any future
  // calendar "generate" action. centerCode/device/user are injected in main,
  // never sent from the renderer. Gated by `core.calendar.week` in the use case;
  // idempotent — re-running over the same window persists no duplicates. Returns
  // the generated window as envelope-stripped `sessionViewSchema` rows.
  'session.generate': {
    request: generateSessionsSchema,
    response: z.object({ sessions: z.array(sessionViewSchema) }),
  },
  // Per-session roll-call (SOU-58). One batched write for the whole roster — one
  // transaction, one round trip, never one call per student — so marking a
  // 20-student session takes seconds, not minutes. The request is the domain's
  // own `recordSessionAttendanceSchema` (prefixed `ses_` id, a non-empty
  // `records` array of prefixed `stu_` id + status, no duplicate studentId),
  // validated once and reused by the roll-call screen. The roster itself is
  // sourced from the existing `group.roster` channel — this ticket adds no new
  // roster read. Each submitted student is either edited in place (a same-day
  // correction) or created fresh; the response returns every resulting record.
  // centerCode/device/user are injected in main, never sent from the renderer.
  // Gated by `core.attendance` (every plan). `note` is out of scope this ticket
  // (KICKOFF) — every record comes back with `note: null` in the domain.
  'attendance.record': {
    request: recordSessionAttendanceSchema,
    response: z.object({ records: z.array(attendanceRecordViewSchema) }),
  },
  // Attendance reporting reads (SOU-108) — the parent-conversation read side, both
  // gated by `core.attendance` (every plan) in the domain use cases. Pure reads,
  // no side effects; month is a strict `YYYY-MM`. `studentReport` returns the
  // student's session-by-session history for the month (optionally one group)
  // plus the absence summary (attendance-rate percent shared with SOU-100, the
  // longest consecutive-absence run, and the ≥3 streak flag). `groupSheet`
  // returns the printable per-group sheet: sessions as columns and, per student,
  // a `cells` array parallel to `sessions` (`null` where no record exists).
  'attendance.studentReport': {
    request: z.object({ studentId: z.string(), month: z.string().regex(/^\d{4}-\d{2}$/), groupId: z.string().optional() }),
    response: z.object({
      studentId: z.string(),
      history: z.array(
        z.object({
          sessionId: z.string(),
          date: z.string(),
          groupId: z.string().nullable(),
          groupName: z.object({ fr: z.string(), ar: z.string() }).nullable(),
          status: z.enum(['present', 'absent', 'excused', 'late']),
          note: z.string().nullable(),
        }),
      ),
      summary: z.object({
        attendanceRatePercent: z.number(),
        consecutiveAbsences: z.number().int(),
        hasAbsenceStreak: z.boolean(),
        counts: z.object({ present: z.number().int(), absent: z.number().int(), excused: z.number().int(), late: z.number().int() }),
      }),
    }),
  },
  'attendance.groupSheet': {
    request: z.object({ groupId: z.string(), month: z.string().regex(/^\d{4}-\d{2}$/) }),
    response: z.object({
      groupId: z.string(),
      sessions: z.array(z.object({ sessionId: z.string(), date: z.string() })),
      students: z.array(
        z.object({
          studentId: z.string(),
          name: z.object({ fr: z.string(), ar: z.string() }),
          cells: z.array(z.enum(['present', 'absent', 'excused', 'late']).nullable()),
        }),
      ),
    }),
  },
  // Dashboard reads (SOU-100). `basic` is every plan (`dashboard.basic`);
  // `advanced` is gated by `dashboard.advanced` (Premium) in the domain use
  // case — a locked plan rejects with `PlanFeatureUnavailableError`, mapped by
  // the shared dispatcher like any other gated channel, not a special response
  // shape here. centerCode is injected in main, never sent from the renderer.
  'dashboard.basic': {
    request: z.object({}),
    response: z.object({ summary: dashboardBasicSummarySchema }),
  },
  'dashboard.advanced': {
    request: z.object({}),
    response: z.object({ summary: dashboardAdvancedSummarySchema }),
  },
  // Weekly recurring session write channels (SOU-131 — populate the planner grid).
  // The requests are the domain's own input schemas (`wrs_`/`rom_`/`tch_`/`grp_`
  // prefixes, `HH:mm` times, `YYYY-MM-DD` validity bounds), validated once and
  // shared by the form (zodResolver), the preload types, and this boundary.
  // centerCode/device/user are injected in main, never sent from the renderer.
  // Gated by `core.calendar.week` in the use cases, which also run the SOU-55
  // composite conflict check (room + teacher + hours) and reject a clashing slot
  // with a standard scheduling error. `teacherId`/`groupId` are optional; the
  // validity window and `active` default (unbounded / true). create/update echo
  // only the id — the grid refetches the enriched `session.week` after a mutation
  // (mirrors `holiday.create`); delete is a soft delete (cancel).
  'weeklySession.create': {
    request: weeklyRecurringSessionInputSchema,
    response: z.object({ id: z.string() }),
  },
  'weeklySession.update': {
    request: weeklyRecurringSessionUpdateSchema,
    response: z.object({ id: z.string() }),
  },
  'weeklySession.delete': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  // Weekly schedule print/PDF export (SOU-107): renders the planner grid's full
  // live week (the same rows `session.week` returns) to the same bilingual
  // FR/AR `pdf-lib` layout family as the invoice/payslip/receipt PDFs, A4
  // landscape — full center, or narrowed to one room/teacher/group via `view`
  // (see `scheduleExportViewFilterSchema`). `print` opens it in the OS's
  // default PDF viewer; `export` lets the user pick a save location. `locale`
  // picks the PDF's language independent of the app's active UI locale,
  // mirroring `invoice.print`/`invoice.export`. centerCode is injected in
  // main, never sent from the renderer. Gated by `core.calendar.week` (every
  // plan) via the reused `ListWeekSessions` use case — no new domain use case.
  'schedule.print': {
    request: z.object({ view: scheduleExportViewFilterSchema, locale: z.enum(['fr', 'ar']) }),
    response: z.object({ ok: z.literal(true) }),
  },
  'schedule.export': {
    request: z.object({ view: scheduleExportViewFilterSchema, locale: z.enum(['fr', 'ar']) }),
    response: z.object({ savedPath: z.string().nullable() }),
  },
  // Auth (SOU-26). `admin.exists` drives first-run detection; `admin.create`
  // reuses the domain credential schema (password policy enforced here too);
  // `admin.verify` is a bare presence check — login must not reject an existing
  // account just because the password policy later tightened. It only bounds
  // length (a correct password can never exceed `PASSWORD_MAX`, so a longer
  // input is always wrong) to keep unbounded strings off the Argon2 path.
  'admin.exists': {
    request: z.object({}),
    response: z.object({ exists: z.boolean() }),
  },
  'admin.create': {
    request: adminCredentialsSchema,
    response: z.object({ id: z.string() }),
  },
  'admin.verify': {
    request: z.object({
      username: z.string().trim().min(1),
      password: z.string().min(1).max(PASSWORD_MAX),
    }),
    response: z.object({ valid: z.boolean() }),
  },
  // Password change (SOU-31 settings page). Single-admin app: no username in
  // the request. Reuses the domain's own `changeAdminPasswordSchema` so the
  // strength rule lives in exactly one place. On failure the renderer matches
  // the thrown error's class name (`InvalidCurrentPasswordError`) — see
  // `session-write-error.ts` for the established pattern of mapping a domain
  // error name that survives the IPC boundary to a `t('errors.<code>')` key.
  'admin.changePassword': {
    request: changeAdminPasswordSchema,
    response: z.object({ ok: z.literal(true) }),
  },
  // Center opening hours (SOU-29). `get` returns only persisted rows (empty on a
  // fresh center — the renderer seeds from the domain's DEFAULT_WEEKLY_HOURS).
  // `save` takes the whole 7-row week (the domain's own schema) and echoes back
  // the saved rows; centerCode/device/user are injected in main, never sent.
  'centerHours.get': {
    request: z.object({}),
    response: z.object({ week: z.array(centerHoursViewSchema) }),
  },
  'centerHours.save': {
    request: weeklyHoursSchema,
    response: z.object({ week: z.array(centerHoursViewSchema) }),
  },
  // Login (SOU-27). `auth.login` is the throttled entry point: it counts failed
  // attempts, enforces the 5-try / 15-minute lockout, and — when the "remember
  // this device" toggle is on — persists a session. The response is a
  // discriminated union so the screen can render its three states without
  // guessing; `Date`s are serialized to epoch millis for the boundary.
  'auth.login': {
    request: loginInputSchema,
    response: z.discriminatedUnion('outcome', [
      z.object({ outcome: z.literal('success') }),
      z.object({
        outcome: z.literal('invalid-credentials'),
        remainingAttempts: z.number().int().nonnegative(),
      }),
      z.object({
        outcome: z.literal('locked-out'),
        lockedUntilMs: z.number().int().nonnegative(),
      }),
    ]),
  },
  // `auth.session` answers "is this device still remembered?" on startup;
  // `auth.logout` forgets it. Neither exposes the session id to the renderer.
  'auth.session': {
    request: z.object({}),
    response: z.object({ authenticated: z.boolean() }),
  },
  'auth.logout': {
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
  },
  // Recovery codes (SOU-154). `admin.recovery.generate` returns the
  // plaintext codes exactly once; the renderer must handle them and
  // clear them after display — they are never persisted plaintext in
  // any layer. `admin.recovery.count` answers "X of 16 remaining" for
  // the settings screen (SOU-156). `auth.resetWithCode` accepts a
  // recovery code + new password (checked against the domain schema).
  'admin.recovery.generate': {
    request: z.object({}),
    response: z.object({ codes: z.array(z.string()) }),
  },
  'admin.recovery.count': {
    request: z.object({}),
    response: z.object({ remaining: z.number().int().nonnegative() }),
  },
  'auth.resetWithCode': {
    request: z.object({
      code: recoveryCodeSchema,
      password: resetPasswordWithRecoveryCodeSchema.shape.newPassword,
    }),
    response: z.discriminatedUnion('outcome', [
      z.object({ outcome: z.literal('success') }),
      z.object({
        outcome: z.literal('locked-out'),
        lockedUntilMs: z.number().int().nonnegative(),
      }),
    ]),
  },
  // Center profile (SOU-28). `center.get` returns the single row (or null before
  // first save). `center.save` upserts the editable profile fields — the request
  // is the domain's own `centerProfileSchema` plus the `logoPath` produced by a
  // prior `center.saveLogo` upload. `plan` is never accepted here (display-only,
  // seeded once at creation). `center.saveLogo` writes the picked file's bytes
  // under app data and returns the relative path to carry in the next save.
  'center.get': {
    request: z.object({}),
    response: z.object({ center: centerDto.nullable() }),
  },
  'center.save': {
    request: centerProfileSchema.extend({
      logoPath: z.string().max(CENTER_LOGO_PATH_MAX).nullable(),
    }),
    response: z.object({ center: centerDto }),
  },
  'center.saveLogo': {
    request: z.object({
      bytes: z.instanceof(Uint8Array),
      extension: z.string(),
    }),
    response: z.object({ path: z.string() }),
  },
  // `center.logoBytes` reads back a stored logo so the renderer can re-display it
  // after a reload (the row keeps only the relative path, not the bytes). The data
  // adapter guards against path traversal and returns `null` for an unknown or
  // stale reference, so a missing logo is a normal, non-erroring response.
  'center.logoBytes': {
    request: z.object({ path: z.string().max(CENTER_LOGO_PATH_MAX) }),
    // `z.custom<Uint8Array>` (not `z.instanceof`) so the inferred type stays the
    // library-default `Uint8Array` the domain port returns — `z.instanceof`
    // narrows to `Uint8Array<ArrayBuffer>` and rejects `ArrayBufferLike`-backed bytes.
    response: z.object({
      bytes: z.custom<Uint8Array>((v) => v instanceof Uint8Array).nullable(),
    }),
  },
  // Locale preference (SOU-31 language tab). Persists the choice to the
  // unencrypted main-process preference file so it survives a restart — the
  // renderer also calls `i18n.changeLanguage` itself for the immediate,
  // no-reload switch. `get` doesn't exist: the initial locale already arrives
  // via the `?locale=` query string the main process injects at window
  // creation, read from the same store before the window opens.
  'preferences.locale.set': {
    request: z.object({ locale: localePreferenceSchema }),
    response: z.object({ ok: z.literal(true) }),
  },
  ...backupIpcContract,
  ...dialogIpcContract,
} as const;

/** The Subject boundary DTO — the renderer's `SubjectView` is an alias of this. */
export type SubjectDto = z.infer<typeof subjectViewSchema>;

/** The subject-with-usage boundary DTO — the renderer's `SubjectUsageView` aliases this. */
export type SubjectUsageDto = z.infer<typeof subjectUsageViewSchema>;

/** The Student boundary DTO — the renderer's `StudentView` is an alias of this. */
export type StudentDto = z.infer<typeof studentViewSchema>;

/** The Parent boundary DTO — the renderer's `ParentView` is an alias of this. */
export type ParentDto = z.infer<typeof parentViewSchema>;

/** The Room boundary DTO — the renderer's `RoomView` is an alias of this. */
export type RoomDto = z.infer<typeof roomViewSchema>;

/** The Group boundary DTO — the renderer's `GroupView` is an alias of this. */
export type GroupDto = z.infer<typeof groupViewSchema>;

/** The Group-with-count boundary DTO — the renderer's `GroupWithCountView` aliases this. */
export type GroupWithCountDto = z.infer<typeof groupWithCountViewSchema>;

/** One roster row across the boundary — the renderer's `GroupRosterEntryView` aliases this. */
export type GroupRosterEntryDto = z.infer<typeof groupRosterEntrySchema>;

/** The StudentSubscription boundary DTO — the renderer's `SubscriptionView` aliases this. */
export type SubscriptionDto = z.infer<typeof subscriptionViewSchema>;

/** The Formula boundary DTO — the renderer's `FormulaView` aliases this. */
export type FormulaDto = z.infer<typeof formulaViewSchema>;

/** The Payment boundary DTO — the renderer's `PaymentView` is an alias of this. */
export type PaymentDto = z.infer<typeof paymentViewSchema>;

/** The invoice payment summary DTO — the renderer's `InvoicePaymentSummaryView` aliases this. */
export type InvoicePaymentSummaryDto = z.infer<typeof invoicePaymentSummarySchema>;

/** The invoice list/detail DTO — the renderer's `InvoiceListItemView` aliases this. */
export type InvoiceListItemDto = z.infer<typeof invoiceListItemViewSchema>;

/** The Teacher boundary DTO — the renderer's `TeacherView` is an alias of this. */
export type TeacherDto = z.infer<typeof teacherViewSchema>;

/** One command-palette result — the renderer's `PersonSearchResultView` aliases this. */
export type PersonSearchResultDto = z.infer<typeof personSearchResultSchema>;

/** The TeacherPayrollRule boundary DTO — the renderer's `TeacherPayrollRuleView` aliases this. */
export type TeacherPayrollRuleDto = z.infer<typeof teacherPayrollRuleViewSchema>;

/** The TeacherPayout boundary DTO — the renderer's `TeacherPayoutView` aliases this. */
export type TeacherPayoutDto = z.infer<typeof teacherPayoutViewSchema>;

/** One flat attribution-breakdown row — the renderer's `TeacherAttributionBreakdownEntryView` aliases this. */
export type TeacherAttributionBreakdownEntryDto = z.infer<typeof teacherAttributionBreakdownEntrySchema>;

/** The Holiday boundary DTO — the renderer's `HolidayView` is an alias of this. */
export type HolidayDto = z.infer<typeof holidayViewSchema>;

/** The weekly-session boundary DTO — the renderer's `WeeklySessionView` aliases this. */
export type WeeklySessionDto = z.infer<typeof weeklySessionViewSchema>;

/** The schedule PDF export's view-filter boundary DTO — the renderer's export
 *  dialog builds one of these from its own already-loaded room/teacher/group
 *  filter state. */
export type ScheduleExportViewFilterDto = z.infer<typeof scheduleExportViewFilterSchema>;

/** The concrete dated-session boundary DTO — the renderer's `SessionView` aliases this. */
export type SessionDto = z.infer<typeof sessionViewSchema>;

/** The AttendanceRecord boundary DTO — the renderer's `AttendanceRecordView` aliases this. */
export type AttendanceRecordDto = z.infer<typeof attendanceRecordViewSchema>;

/** The Basique dashboard summary DTO — the renderer's `DashboardBasicSummaryView` aliases this. */
export type DashboardBasicSummaryDto = z.infer<typeof dashboardBasicSummarySchema>;

/** The Avancé dashboard summary DTO — the renderer's `DashboardAdvancedSummaryView` aliases this. */
export type DashboardAdvancedSummaryDto = z.infer<typeof dashboardAdvancedSummarySchema>;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;

export type IpcHandlers = {
  [C in IpcChannel]: (request: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>;
};

export function isIpcChannel(value: string): value is IpcChannel {
  return Object.prototype.hasOwnProperty.call(ipcContract, value);
}
