import type { FeatureFlag } from '@centresoutien/domain';

/**
 * Maps every plan feature flag to its i18n key under `settings.plan.features.*`
 * (Plan tab, SOU-31). A `Record<FeatureFlag, string>` so a new flag added to
 * `plans.ts` fails typecheck here until it's given a label — the plan tab can
 * never silently omit one.
 */
export const FEATURE_LABEL_KEYS: Record<FeatureFlag, string> = {
  'core.rooms': 'coreRooms',
  'core.teachers': 'coreTeachers',
  'core.students': 'coreStudents',
  'core.groups': 'coreGroups',
  'core.subjects': 'coreSubjects',
  'core.formulas': 'coreFormulas',
  'core.calendar.week': 'coreCalendarWeek',
  'core.invoicing': 'coreInvoicing',
  'core.parents': 'coreParents',
  'core.attendance': 'coreAttendance',
  'settings.center-hours': 'settingsCenterHours',
  'settings.holidays': 'settingsHolidays',
  'dashboard.basic': 'dashboardBasic',
  'core.invoicing.partial-paid': 'invoicingPartialPaid',
  'core.invoice-template.customize': 'invoiceTemplateCustomize',
  'core.exam-prep': 'examPrep',
  'payroll.teacher': 'payrollTeacher',
  'payroll.teacher.fixed': 'payrollTeacherFixed',
  'payroll.teacher.percentage': 'payrollTeacherPercentage',
  'io.excel.export': 'excelExport',
  'io.excel.import': 'excelImport',
  'io.excel.sync': 'excelSync',
  'planning.custom-grid': 'planningCustomGrid',
  'dashboard.advanced': 'dashboardAdvanced',
  'planning.random-auto': 'planningRandomAuto',
  'sync.multi-device': 'syncMultiDevice',
  'sync.cloud': 'syncCloud',
  'sync.conflict-resolution': 'syncConflictResolution',
  'org.multi-center': 'orgMultiCenter',
  'limits.students.unlimited': 'limitsStudentsUnlimited',
  'limits.teachers.unlimited': 'limitsTeachersUnlimited',
};
