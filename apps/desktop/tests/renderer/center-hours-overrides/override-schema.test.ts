import { describe, it, expect } from 'vitest';
import {
  defaultWindow,
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

function issueFor(values: OverrideFormValues, path: readonly (string | number)[]) {
  const result = overrideFormSchema.safeParse(values);
  if (result.success) return undefined;
  return result.error.issues.find(
    (issue) => JSON.stringify(issue.path) === JSON.stringify(path),
  );
}

describe('emptyOverrideForm / defaultWindow', () => {
  it('seeds an empty date range and all seven weekdays closed', () => {
    const form = emptyOverrideForm();
    expect(form.startDate).toBe('');
    expect(form.endDate).toBe('');
    expect(form.days).toHaveLength(7);
    expect(form.days.every((day) => day.windows.length === 0)).toBe(true);
  });

  it('seeds a new window from the domain defaults (09:00–18:00)', () => {
    expect(defaultWindow()).toEqual({ open: '09:00', close: '18:00' });
  });
});

describe('overrideFormSchema (reuses the domain predicates)', () => {
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

  it('flags a window whose close is not after its open on that window close field (invalid-time)', () => {
    const form = baseForm();
    form.days[1] = { dayOfWeek: 1, windows: [{ open: '16:00', close: '10:00' }] };
    const issue = issueFor(form, ['days', 1, 'windows', 0, 'close']);
    expect(issue?.message).toBe('invalid-time');
  });

  it('flags overlapping windows on the day window list (windows-overlap)', () => {
    const form = baseForm();
    form.days[1] = {
      dayOfWeek: 1,
      windows: [
        { open: '09:00', close: '13:00' },
        { open: '12:00', close: '18:00' },
      ],
    };
    const issue = issueFor(form, ['days', 1, 'windows']);
    expect(issue?.message).toBe('windows-overlap');
  });

  it('reports only the per-window defect when a window is malformed, not overlap', () => {
    const form = baseForm();
    form.days[1] = { dayOfWeek: 1, windows: [{ open: '16:00', close: '10:00' }] };
    expect(issueFor(form, ['days', 1, 'windows'])).toBeUndefined();
  });

  it('rejects an end date before the start date', () => {
    const form = { ...baseForm(), startDate: '2026-03-30', endDate: '2026-03-01' };
    expect(firstErrorCode(form)).toBe('end-before-start');
  });

  it('rejects an empty (non-calendar) date', () => {
    const form = { ...baseForm(), startDate: '', endDate: '' };
    expect(firstErrorCode(form)).toBe('invalid-date');
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
