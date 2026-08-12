import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/renderer/i18n/config';
import { AllSessionsRow } from '../../../src/renderer/components/planning/all-sessions-row';
import type { PlannerSessionView } from '../../../src/renderer/lib/planning/planner-view';

const updateMock = vi.fn();
vi.mock('../../../src/renderer/lib/planning/session-write-gateway', () => ({
  sessionWriteGateway: {
    update: (id: string, input: unknown) => updateMock(id, input),
    cancel: vi.fn(),
  },
}));
vi.mock('../../../src/renderer/hooks/planning/use-session-form-options', () => ({
  useSessionFormOptions: () => ({
    data: { rooms: [{ id: 'rom_1', name: 'Salle 1' }], teachers: [], groups: [] },
  }),
}));

const session: PlannerSessionView = {
  id: 'wrs_1',
  dayOfWeek: 1,
  start: '09:00',
  end: '10:00',
  roomId: 'rom_1',
  roomName: 'Salle 1',
  teacherId: null,
  teacherName: null,
  groupId: null,
  subjectId: null,
  subjectName: null,
  level: null,
  kind: 'regular',
};

function renderRow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AllSessionsRow session={session} />
    </QueryClientProvider>,
  );
}

describe('AllSessionsRow', () => {
  beforeEach(() => {
    updateMock.mockReset();
    void i18n.changeLanguage('fr');
  });

  it('shows the template summary collapsed and reveals the form on expand', async () => {
    renderRow();
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /modifier|edit|09:00/i }));
    await waitFor(() => expect(screen.getByLabelText(/début|start/i)).toBeInTheDocument());
  });

  it('submits the mapped input through the update gateway', async () => {
    updateMock.mockResolvedValue({ id: 'wrs_1' });
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: /modifier|edit|09:00/i }));
    await waitFor(() => screen.getByLabelText(/début|start/i));
    fireEvent.click(screen.getByRole('button', { name: /enregistrer|save/i }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('wrs_1', expect.objectContaining({ start: '09:00' })));
  });

  it('clears a stale conflict alert after the row is collapsed and reopened', async () => {
    updateMock.mockRejectedValue({ code: 'RoomConflictError' });
    renderRow();
    const toggle = screen.getByRole('button', { name: /modifier|edit|09:00/i });

    fireEvent.click(toggle);
    await waitFor(() => screen.getByLabelText(/début|start/i));
    fireEvent.click(screen.getByRole('button', { name: /enregistrer|save/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() => screen.getByLabelText(/début|start/i));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
