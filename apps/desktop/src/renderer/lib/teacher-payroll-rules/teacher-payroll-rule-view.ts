import type { TeacherPayrollRuleInput } from '@centresoutien/domain';
import type { TeacherPayrollRuleDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `TeacherPayrollRule` as it crosses the IPC
 * boundary (SOU-72) — the sync envelope is stripped, exactly like
 * `TeacherView`. There is no stored status: the renderer derives active vs.
 * history from `endMonth` (`null` = the one live open-ended rule = Active;
 * set = History) — see `TeacherPayrollRuleTab`.
 *
 * A direct alias of the boundary's `teacherPayrollRuleViewSchema` (the single
 * source of truth in `shared/ipc/contract`), so the renderer shape can never
 * drift from what the `teacherPayrollRule.list` channel actually returns.
 */
export type TeacherPayrollRuleView = TeacherPayrollRuleDto;

/** The fields captured when creating a payroll rule — the domain's own discriminated schema. */
export type { TeacherPayrollRuleInput };
