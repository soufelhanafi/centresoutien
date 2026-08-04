import { z } from 'zod';
import type { Control } from 'react-hook-form';
import type { WeekdayIndex } from '@centresoutien/domain';
import type { GeneratorPreviewConfig } from './session-generator-gateway';

/**
 * The user-editable config of the auto-session-generator popup (SOU-159),
 * validated by this schema so the form (via `zodResolver`) enforces the shape
 * before the dry-run preview leaves the renderer. It binds **by shape** to the
 * domain's own `SessionGeneratorConfig` wire contract (the
 * `session.generator.preview` request): {@link toGeneratorConfig} bridges this
 * flat form model to that discriminated-union config.
 *
 * The two `'all'` scope options are modeled as a boolean master toggle plus an id
 * list, so the checkbox UI stays simple; `toGeneratorConfig` collapses them back
 * to the `'all' | Id[]` union. `sessionsPerWeek` is only meaningful in `auto`
 * mode — `custom` mode's session count is exactly its `pickedWeekdays.length`, so
 * the mapper derives it there rather than trusting a stale field.
 *
 * Field error messages are stable **error codes**, resolved via `t(\`errors.${code}\`)`.
 */
const weekdayList = z.array(z.number().int().min(0).max(6));

export const generatorFormSchema = z
  .object({
    kind: z.enum(['regular', 'exam-prep']),
    scopeGroupsAll: z.boolean(),
    scopeGroupIds: z.array(z.string()),
    scopeTeachersAll: z.boolean(),
    scopeTeacherIds: z.array(z.string()),
    weekdayPool: weekdayList,
    sessionsPerWeek: z.number({ message: 'required' }).int({ message: 'not-an-integer' }).positive({ message: 'too-low' }),
    minGapDays: z.number({ message: 'required' }).int({ message: 'not-an-integer' }).nonnegative({ message: 'too-low' }),
    sessionDurationMinutes: z
      .number({ message: 'required' })
      .int({ message: 'not-an-integer' })
      .positive({ message: 'too-low' }),
    mode: z.enum(['auto', 'custom']),
    pickedWeekdays: weekdayList,
    rangeMode: z.enum(['dates', 'count']),
    startDate: z.string().min(1, { message: 'required' }),
    endDate: z.string(),
    occurrenceCount: z.number({ message: 'required' }).int({ message: 'not-an-integer' }).positive({ message: 'too-low' }),
  })
  .superRefine((value, ctx) => {
    if (!value.scopeGroupsAll && value.scopeGroupIds.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['scopeGroupIds'] });
    }
    if (!value.scopeTeachersAll && value.scopeTeacherIds.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['scopeTeacherIds'] });
    }
    if (value.weekdayPool.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['weekdayPool'] });
    }
    if (value.mode === 'auto' && value.sessionsPerWeek > value.weekdayPool.length) {
      ctx.addIssue({ code: 'custom', message: 'pool-smaller-than-sessions', path: ['sessionsPerWeek'] });
    }
    if (value.mode === 'custom' && value.pickedWeekdays.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['pickedWeekdays'] });
    }
    if (value.rangeMode === 'dates') {
      if (value.endDate.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['endDate'] });
      } else if (value.endDate < value.startDate) {
        ctx.addIssue({ code: 'custom', message: 'end-before-start', path: ['endDate'] });
      }
    }
  });

export type GeneratorFormValues = z.infer<typeof generatorFormSchema>;

/**
 * The RHF `Control` for the generator form. A single type arg suffices — the
 * schema does no input/output transform, so `z.infer` is both sides.
 */
export type GeneratorFormControl = Control<GeneratorFormValues>;

/** Sunday (0) off by default — a Moroccan center's typical rest day — the other six on. */
const DEFAULT_WEEKDAY_POOL: readonly WeekdayIndex[] = [1, 2, 3, 4, 5, 6];

/** Blank config defaults: whole center, regular kind, auto mode, Mon–Sat pool, dated range. */
export const EMPTY_GENERATOR_FORM: GeneratorFormValues = {
  kind: 'regular',
  scopeGroupsAll: true,
  scopeGroupIds: [],
  scopeTeachersAll: true,
  scopeTeacherIds: [],
  weekdayPool: [...DEFAULT_WEEKDAY_POOL],
  sessionsPerWeek: 2,
  minGapDays: 2,
  sessionDurationMinutes: 90,
  mode: 'auto',
  pickedWeekdays: [],
  rangeMode: 'dates',
  startDate: '',
  endDate: '',
  occurrenceCount: 8,
};

/** Bridges the validated form values to the domain's `SessionGeneratorConfig` wire shape. */
export function toGeneratorConfig(values: GeneratorFormValues): GeneratorPreviewConfig {
  const scope = {
    groups: values.scopeGroupsAll ? ('all' as const) : values.scopeGroupIds,
    teachers: values.scopeTeachersAll ? ('all' as const) : values.scopeTeacherIds,
  };
  const range =
    values.rangeMode === 'dates'
      ? { startDate: values.startDate, endDate: values.endDate }
      : { startDate: values.startDate, occurrenceCount: values.occurrenceCount };
  const base = {
    scope,
    kind: values.kind,
    weekdayPool: values.weekdayPool,
    sessionsPerWeek: values.mode === 'custom' ? values.pickedWeekdays.length : values.sessionsPerWeek,
    minGapDays: values.minGapDays,
    sessionDurationMinutes: values.sessionDurationMinutes,
    range,
  };
  return values.mode === 'auto'
    ? { ...base, mode: 'auto' }
    : { ...base, mode: 'custom', pickedWeekdays: values.pickedWeekdays };
}
