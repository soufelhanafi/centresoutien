import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SubjectForm } from '../../src/renderer/components/subject/subject-form';
import i18n from '../../src/renderer/i18n/config';

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SubjectForm />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SubjectForm — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('shows a translated required error per field and does not call IPC', async () => {
    const invoke = vi.fn();
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Créer la matière' }));

    expect(await screen.findAllByText('Ce champ est requis')).toHaveLength(2);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('submits valid input over IPC and shows the success status', async () => {
    const invoke = vi.fn().mockResolvedValue({ id: 'sub_00000000000000000000000001' });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Nom (français)'), 'Mathématiques');
    await user.type(screen.getByLabelText('Nom (arabe)'), 'الرياضيات');
    await user.click(screen.getByRole('button', { name: 'Créer la matière' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Matière créée');
  });
});

describe('SubjectForm — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders Arabic labels and shows the Arabic required error', async () => {
    window.api.invoke = vi.fn();
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByLabelText('الاسم (بالفرنسية)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إنشاء المادة' }));

    expect(await screen.findAllByText('هذا الحقل مطلوب')).toHaveLength(2);
  });
});
