import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDayColumn } from '../../../src/renderer/components/planning/planner-day-column';
import { deriveCenterHoursRange, type MinuteInterval } from '../../../src/renderer/lib/planning/time-range';
import { hoursRow, session } from './_fixtures';
import i18n from '../../../src/renderer/i18n/config';

const range = deriveCenterHoursRange([hoursRow(0, '09:00', '18:00')]);
const fullClosed: MinuteInterval[] = [{ start: range.startHour * 60, end: range.endHour * 60 }];

describe('PlannerDayColumn — closed day', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('renders a hatched, muted, non-interactive column with no session blocks', () => {
    const { container } = render(
      <PlannerDayColumn sessions={[]} range={range} hourPx={56} closedSegments={fullClosed} onSelect={() => {}} />,
    );

    const column = container.firstElementChild;
    expect(column).not.toBeNull();
    expect(column as HTMLElement).toHaveAttribute('aria-hidden', 'true');
    expect(column as HTMLElement).toHaveClass('pointer-events-none');
    const style = (column as HTMLElement).style;
    expect(style.backgroundImage).toContain('repeating-linear-gradient(45deg');
    expect(container.querySelector('button')).toBeNull();
  });

  it('drops session blocks for a fully closed day even when sessions are present', () => {
    const { container } = render(
      <PlannerDayColumn
        sessions={[session({ dayOfWeek: 0 })]}
        range={range}
        hourPx={56}
        closedSegments={fullClosed}
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
        closedSegments={[]}
        onSelect={() => {}}
      />,
    );

    expect(container.querySelector('button')).not.toBeNull();
  });

  it('overlays a hatch on the mid-day gap while keeping session blocks (iftar break)', () => {
    const gap: MinuteInterval[] = [{ start: 12 * 60, end: 14 * 60 }];
    const { container } = render(
      <PlannerDayColumn
        sessions={[session({ dayOfWeek: 0, start: '09:30', end: '11:00' })]}
        range={range}
        hourPx={56}
        closedSegments={gap}
        onSelect={() => {}}
      />,
    );

    const hatch = container.querySelector('[aria-hidden="true"].pointer-events-none.absolute');
    expect(hatch).not.toBeNull();
    expect((hatch as HTMLElement).style.backgroundImage).toContain('repeating-linear-gradient(45deg');
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('formats session block times through Intl', async () => {
    await i18n.changeLanguage('ar');
    render(
      <PlannerDayColumn
        sessions={[session({ dayOfWeek: 0, start: '09:30', end: '11:00' })]}
        range={range}
        hourPx={56}
        closedSegments={[]}
        onSelect={() => {}}
      />,
    );

    const start = new Intl.DateTimeFormat('ar', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(1970, 0, 1, 9, 30)));
    expect(screen.getByText(new RegExp(start))).toHaveAttribute('dir', 'ltr');
  });
});
