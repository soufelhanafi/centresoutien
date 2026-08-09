import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerGrid } from '../../../src/renderer/components/planning/planner-grid';
import { deriveCenterHoursRange } from '../../../src/renderer/lib/planning/time-range';
import { hoursRow } from './_fixtures';
import i18n from '../../../src/renderer/i18n/config';

const noop = () => {};

describe('PlannerGrid — hour gutter labels', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('renders the end-of-day boundary label for a close after 23:00', () => {
    const range = deriveCenterHoursRange([hoursRow(0, '09:00', '23:30')]);
    render(<PlannerGrid sessions={[]} range={range} closedDays={new Set()} onSelect={noop} emptyLabel="" />);
    expect(screen.getByText('24:00')).toBeDefined();
  });

  it('renders the top and bottom labels of a regular range', () => {
    const range = deriveCenterHoursRange([hoursRow(0, '09:00', '18:00')]);
    render(<PlannerGrid sessions={[]} range={range} closedDays={new Set()} onSelect={noop} emptyLabel="" />);
    expect(screen.getByText('09:00')).toBeDefined();
    expect(screen.getByText('18:00')).toBeDefined();
    expect(screen.queryByText('24:00')).toBeNull();
  });
});
