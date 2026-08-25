import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLANS } from '@centresoutien/domain';
import type { ScheduleAuditResult } from '../../../src/renderer/lib/schedule-audit/schedule-audit-gateway';
import type { StrandedGroupView, StrandedSessionView } from '../../../src/renderer/lib/schedule-audit/stranded-session-view';
import { CenterHoursStrandedWarning } from '../../../src/renderer/components/settings/center-hours-stranded-warning';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import { planningModule } from '../../../src/renderer/app/nav-items';
import i18n from '../../../src/renderer/i18n/config';
import { planWithout } from '../fakes/plan';

function auditResult(groups: readonly StrandedGroupView[]): ScheduleAuditResult {
  return { groups, recurringSlotWarnings: [] };
}

const mockStranded = vi.hoisted(() => ({
  result: { data: undefined } as { data: ScheduleAuditResult | undefined },
  spy: vi.fn(),
}));

vi.mock('../../../src/renderer/hooks/schedule-audit/use-stranded-sessions', () => ({
  useStrandedSessions: (options?: { enabled?: boolean }) => {
    mockStranded.spy(options);
    return mockStranded.result;
  },
}));

// Stub the router Link with a plain anchor so the warning renders synchronously,
// without a RouterProvider whose route tree mounts on a later tick.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

function strandedSession(index: number): StrandedSessionView {
  return {
    session: {
      id: `ses_${index}`,
      recurringSessionId: `rec_${index}`,
      date: '2026-09-01',
      start: '18:00',
      end: '19:00',
      roomId: `room_${index}`,
      roomName: null,
      roomCapacity: null,
      roomArchived: false,
      teacherId: null,
      teacherName: null,
      groupId: null,
      subjectId: null,
      subjectName: null,
      level: null,
      kind: 'regular',
    },
    reasons: ['outside-center-hours'],
  };
}

function strandedGroup(index: number, count = 1): StrandedGroupView {
  return {
    key: `outside-center-hours|1|`,
    reason: 'outside-center-hours',
    weekday: 1,
    resourceKind: 'center',
    resourceId: null,
    count,
    occurrences: [strandedSession(index)],
  };
}

function strandedList(count: number): readonly StrandedGroupView[] {
  return Array.from({ length: count }, (_, index) => strandedGroup(index));
}

beforeEach(() => {
  mockStranded.result = { data: auditResult([]) };
  mockStranded.spy.mockClear();
  usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
});

afterEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('CenterHoursStrandedWarning — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('renders nothing when no session is stranded', () => {
    mockStranded.result = { data: auditResult([]) };
    const { container } = render(<CenterHoursStrandedWarning />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('warns with the singular count and a review CTA to Planning', () => {
    mockStranded.result = { data: auditResult(strandedList(1)) };
    render(<CenterHoursStrandedWarning />);

    expect(screen.getByRole('status')).toHaveTextContent(
      "1 séance tombe désormais hors des horaires d'ouverture.",
    );
    expect(screen.getByRole('link', { name: 'Vérifier le planning' })).toHaveAttribute(
      'href',
      planningModule.path,
    );
  });

  it('warns with the pluralized count when several sessions are stranded', () => {
    mockStranded.result = { data: auditResult(strandedList(3)) };
    render(<CenterHoursStrandedWarning />);

    expect(screen.getByRole('status')).toHaveTextContent(
      "3 séances tombent désormais hors des horaires d'ouverture.",
    );
  });

  it('sums occurrence counts across groups, not the group count', () => {
    mockStranded.result = { data: auditResult([strandedGroup(0, 4)]) };
    render(<CenterHoursStrandedWarning />);

    expect(screen.getByRole('status')).toHaveTextContent(
      "4 séances tombent désormais hors des horaires d'ouverture.",
    );
  });

  it('renders nothing and keeps the audit query dormant when the feature is off', () => {
    usePlanStore.setState({ plan: planWithout('settings.center-hours') });
    mockStranded.result = { data: auditResult(strandedList(2)) };
    const { container } = render(<CenterHoursStrandedWarning />);

    expect(container).toBeEmptyDOMElement();
    expect(mockStranded.spy).toHaveBeenCalledWith({ enabled: false });
  });
});

describe('CenterHoursStrandedWarning — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders the Arabic warning copy and CTA', () => {
    mockStranded.result = { data: auditResult(strandedList(3)) };
    render(<CenterHoursStrandedWarning />);

    expect(screen.getByRole('status')).toHaveTextContent('حصص أصبحت الآن خارج مواعيد العمل.');
    expect(screen.getByRole('link', { name: 'مراجعة الجدول' })).toBeInTheDocument();
  });
});
