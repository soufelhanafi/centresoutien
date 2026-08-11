import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/renderer/i18n/config';
import { AllSessionsDrawer } from '../../../src/renderer/components/planning/all-sessions-drawer';
import type { PlannerSessionView } from '../../../src/renderer/lib/planning/planner-view';

const sessions: PlannerSessionView[] = [
  { id: 'wrs_1', dayOfWeek: 1, start: '09:00', end: '10:00', roomId: 'rom_1', roomName: 'Salle 1', teacherId: null, teacherName: null, groupId: null, subjectId: null, subjectName: { fr: 'Maths', ar: 'رياضيات' }, level: null, kind: 'regular' },
  { id: 'wrs_2', dayOfWeek: 3, start: '11:00', end: '12:00', roomId: 'rom_2', roomName: 'Salle 2', teacherId: null, teacherName: null, groupId: null, subjectId: null, subjectName: { fr: 'Physique', ar: 'فيزياء' }, level: null, kind: 'regular' },
];

vi.mock('../../../src/renderer/lib/planning/planner-gateway', () => ({
  plannerGateway: { listWeek: () => Promise.resolve(sessions) },
}));
vi.mock('../../../src/renderer/hooks/planning/use-session-form-options', () => ({
  useSessionFormOptions: () => ({ data: { rooms: [], teachers: [], groups: [] } }),
}));

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AllSessionsDrawer open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('AllSessionsDrawer', () => {
  beforeEach(() => { void i18n.changeLanguage('fr'); });

  it('lists sessions grouped by weekday', async () => {
    renderDrawer();
    expect(await screen.findByText(/Maths/)).toBeInTheDocument();
    expect(screen.getByText(/Physique/)).toBeInTheDocument();
    expect(screen.getByText('Lundi')).toBeInTheDocument();
    expect(screen.getByText('Mercredi')).toBeInTheDocument();
  });

  it('renders the regeneration note', async () => {
    renderDrawer();
    expect(await screen.findByText(/génération|regénér|futures/i)).toBeInTheDocument();
  });

  it('mounts in Arabic (RTL)', async () => {
    await i18n.changeLanguage('ar');
    renderDrawer();
    expect(await screen.findByText(/رياضيات/)).toBeInTheDocument();
  });
});
