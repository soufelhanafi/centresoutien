import { describe, it, expect } from 'vitest';
import {
  emptyOverrideForm,
  overrideFormSchema,
  overrideFormToInput,
  type OverrideFormValues,
} from '../../../src/renderer/lib/center-hours-overrides/override-schema';

/** A valid base: a dated range with Monday open, tweaked per case. */
function baseForm(): OverrideFormValues {
  const form = emptyOverrideForm();
  return {
    ...form,
    startDate: '2026-03-01',
    endDate: '2026-03-30',
    days: form.days.map((day) =>
      day.dayOfWeek === 1 ? { ...day, windows: [{ open: '10:00', close: '16:00' }] } : day,
    ),
  };
}

function firstErrorCode(values: OverrideFormValues): string | undefined {
  const result = overrideFormSchema.safeParse(values);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('overrideFormSchema', () => {
  it('accepts a dated range with a single open window', () => {
    expect(overrideFormSchema.safeParse(baseForm()).success).toBe(true);
  });

  it('accepts two windows a day with a mid-day iftar gap between them', () => {
    const form = baseForm();
    form.days[1] = {
      dayOfWeek: 1,
      windows: [
        { open: '09:00', close: '12:00' },
        { open: '14:00', close: '18:00' },
      ],
    };
    expect(overrideFormSchema.safeParse(form).success).toBe(true);
  });

  it('rejects a window whose close is not after its open', () => {
    const form = baseForm();
    form.days[1] = { dayOfWeek: 1, windows: [{ open: '16:00', close: '10:00' }] };
    expect(firstErrorCode(form)).toBe('close-before-open');
  });

  it('rejects overlapping windows within a day', () => {
    const form = baseForm();
    form.days[1] = {
      dayOfWeek: 1,
      windows: [
        { open: '09:00', close: '13:00' },
        { open: '12:00', close: '18:00' },
      ],
    };
    expect(firstErrorCode(form)).toBe('windows-overlap');
  });

  it('rejects an end date before the start date', () => {
    const form = { ...baseForm(), startDate: '2026-03-30', endDate: '2026-03-01' };
    expect(firstErrorCode(form)).toBe('end-before-start');
  });

  it('requires both dates', () => {
    const form = { ...baseForm(), startDate: '', endDate: '' };
    expect(firstErrorCode(form)).toBe('required');
  });
});

describe('overrideFormToInput', () => {
  it('folds the seven-row form into a hoursByWeekday record with the date range', () => {
    const input = overrideFormToInput(baseForm());
    expect(input.dateRange).toEqual({ start: '2026-03-01', end: '2026-03-30' });
    expect(input.hoursByWeekday[1]).toEqual([{ open: '10:00', close: '16:00' }]);
    expect(input.hoursByWeekday[0]).toEqual([]);
    expect(Object.keys(input.hoursByWeekday)).toHaveLength(7);
  });
});
