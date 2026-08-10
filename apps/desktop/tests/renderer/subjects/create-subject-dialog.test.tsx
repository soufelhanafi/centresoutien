import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateSubjectDialog } from '../../../src/renderer/components/subject/create-subject-dialog';
import { subjectsGateway } from '../../../src/renderer/lib/subjects/subjects-gateway';
import i18n from '../../../src/renderer/i18n/config';

/**
 * `CreateSubjectDialog` owns the create mutation and maps a duplicate-code
 * rejection onto an inline field error (SOU-137). These tests drive the real
 * hook through a spied gateway — no component mocks — and assert the two
 * failure modes the error-state protocol must not drop: a repeat rejection
 * after an edit, and a stale error surviving a reopen.
 */
function renderDialog(open: boolean, onOpenChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <CreateSubjectDialog open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { view, onOpenChange };
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(i18n.t('subjects.form.nameFr')), 'Chimie');
  await user.type(screen.getByLabelText(i18n.t('subjects.form.nameAr')), 'الكيمياء');
  await user.type(screen.getByLabelText(i18n.t('subjects.form.code')), 'CHIM');
  await user.click(screen.getByRole('button', { name: i18n.t('subjects.form.create') }));
}

const errorText = () => i18n.t('errors.duplicate-subject-code');
const duplicateRejection = { code: 'duplicate-subject-code', message: 'duplicate' };

describe('CreateSubjectDialog — duplicate-code inline error (SOU-137)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    vi.restoreAllMocks();
  });

  it('surfaces the duplicate-code rejection inline on the code field', async () => {
    vi.spyOn(subjectsGateway, 'create').mockRejectedValue(duplicateRejection);
    renderDialog(true);

    await fillAndSubmit();

    expect(await screen.findByText(errorText())).toBeInTheDocument();
  });

  it('re-applies the inline error after an edit when the same duplicate is resubmitted', async () => {
    vi.spyOn(subjectsGateway, 'create').mockRejectedValue(duplicateRejection);
    renderDialog(true);
    const user = userEvent.setup();

    await fillAndSubmit();
    expect(await screen.findByText(errorText())).toBeInTheDocument();

    await user.type(screen.getByLabelText(i18n.t('subjects.form.code')), 'M');
    expect(screen.queryByText(errorText())).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: i18n.t('subjects.form.create') }));
    expect(await screen.findByText(errorText())).toBeInTheDocument();
  });

  it('clears a stale duplicate error when the dialog is reopened', async () => {
    vi.spyOn(subjectsGateway, 'create').mockRejectedValue(duplicateRejection);
    const { view } = renderDialog(true);

    await fillAndSubmit();
    expect(await screen.findByText(errorText())).toBeInTheDocument();

    view.rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <CreateSubjectDialog open={false} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(errorText())).not.toBeInTheDocument();

    view.rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <CreateSubjectDialog open={true} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(screen.queryByText(errorText())).not.toBeInTheDocument();
  });
});
