import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeacherSubjectsTab } from '../../src/renderer/components/teacher/teacher-subjects-tab';
import {
  TeacherForm,
  EMPTY_TEACHER_INPUT,
} from '../../src/renderer/components/teacher/teacher-form';
import type { TeacherView } from '../../src/renderer/lib/teachers/teacher-view';
import i18n from '../../src/renderer/i18n/config';

const MATH = {
  id: 'sub_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  name: { fr: 'Mathématiques', ar: 'الرياضيات' },
  code: 'MATH',
  active: true,
};
const PHYS = {
  id: 'sub_01ARZ3NDEKTSV4RRFFQ69G5FB0',
  name: { fr: 'Physique', ar: 'الفيزياء' },
  code: 'PHYS',
  active: false,
};

function teacher(subjectIds: string[]): TeacherView {
  return {
    id: 'tch_1',
    name: { fr: 'Karim', ar: 'كريم' },
    cin: null,
    phone: '+212612345678',
    email: null,
    subjectIds,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function withClient(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TeacherSubjectsTab', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('resolves subjectIds to names and marks an inactive subject', async () => {
    window.api.invoke = vi.fn().mockResolvedValue({ subjects: [MATH, PHYS] });
    withClient(<TeacherSubjectsTab teacher={teacher([MATH.id, PHYS.id])} />);

    expect(await screen.findByText('Mathématiques')).toBeInTheDocument();
    expect(screen.getByText('Physique')).toBeInTheDocument();
    // The since-deactivated link still resolves and is flagged inactive.
    expect(screen.getByText('(inactive)')).toBeInTheDocument();
  });

  it('shows the empty state when the teacher has no subjects', () => {
    window.api.invoke = vi.fn().mockResolvedValue({ subjects: [] });
    withClient(<TeacherSubjectsTab teacher={teacher([])} />);

    expect(screen.getByText('Aucune matière assignée')).toBeInTheDocument();
  });
});

describe('TeacherForm — subject multi-select', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('writes the checked subject into subjectIds on submit', async () => {
    window.api.invoke = vi.fn().mockResolvedValue({ subjects: [MATH, PHYS] });
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    withClient(
      <>
        <TeacherForm formId="tf" defaultValues={EMPTY_TEACHER_INPUT} onSubmit={onSubmit} />
        <button type="submit" form="tf">
          go
        </button>
      </>,
    );

    // The active subject is offered; the inactive one is not (no existing link).
    const mathBox = await screen.findByRole('checkbox', { name: 'Mathématiques' });
    expect(screen.queryByText('Physique')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Nom (français)'), 'Karim');
    await user.type(screen.getByLabelText('Nom (arabe)'), 'كريم');
    await user.type(screen.getByLabelText('Téléphone'), '0612345678');
    await user.click(mathBox);
    await user.click(screen.getByRole('button', { name: 'go' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].subjectIds).toEqual([MATH.id]);
  });
});
