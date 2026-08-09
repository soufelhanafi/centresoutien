import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDayColumn } from '../../../src/renderer/components/planning/planner-day-column';
import { deriveCenterHoursRange } from '../../../src/renderer/lib/planning/time-range';
import { hoursRow, session } from './_fixtures';
import i18n from '../../../src/renderer/i18n/config';

const range = deriveCenterHoursRange([hoursRow(0, '09:00', '18:00')]);

describe('PlannerDayColumn — closed day', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('renders a hatched, muted, non-interactive column with no session blocks', () => {
    const { container } = render(
      <PlannerDayColumn sessions={[]} range={range} hourPx={56} closed onSelect={() => {}} />,
    );

    const column = container.firstElementChild;
    expect(column).not.toBeNull();
    expect(column as HTMLElement).toHaveAttribute('aria-hidden', 'true');
    expect(column as HTMLElement).toHaveClass('pointer-events-none');
    const style = (column as HTMLElement).style;
    expect(style.backgroundImage).toContain('repeating-linear-gradient(45deg');
    expect(container.querySelector('button')).toBeNull();
  });

  it('drops session blocks for a closed day even when sessions are present', () => {
    const { container } = render(
      <PlannerDayColumn
        sessions={[session({ dayOfWeek: 0 })]}
        range={range}
        hourPx={56}
        closed
        onSelect={() => {}}
      />,
    );

    expect(container.querySelector('button')).toBeNull();
  });

  it('renders session blocks when the day is open', () => {
    const { container } = render(
      <PlannerDayColumn
        sessions={[session({ dayOfWeek: 0 })]}
        range={range}
        hourPx={56}
        closed={false}
        onSelect={() => {}}
      />,
    );

    expect(container.querySelector('button')).not.toBeNull();
  });
});
