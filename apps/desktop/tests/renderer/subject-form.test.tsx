import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubjectForm, EMPTY_SUBJECT_INPUT } from '../../src/renderer/components/subject/subject-form';
import i18n from '../../src/renderer/i18n/config';

/**
 * `SubjectForm` is presentation-only (SOU-47): it owns no mutation, so it is
 * exercised here with an external submit button bound via `form={formId}` —
 * exactly how `CreateSubjectDialog` wires its footer button outside the form.
 */
function renderForm(onSubmit = vi.fn()) {
  render(
    <>
      <SubjectForm formId="subject-form" defaultValues={EMPTY_SUBJECT_INPUT} onSubmit={onSubmit} />
      <button type="submit" form="subject-form">
        submit
      </button>
    </>,
  );
  return onSubmit;
}

describe('SubjectForm — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('shows a translated required error per field and does not call onSubmit', async () => {
    const onSubmit = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(await screen.findAllByText('Ce champ est requis')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the bilingual name and the trimmed/uppercased code', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Nom (français)'), 'Mathématiques');
    await user.type(screen.getByLabelText('Nom (arabe)'), 'الرياضيات');
    await user.type(screen.getByLabelText('Code (optionnel)'), 'math');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      }),
    );
  });
});

describe('SubjectForm — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders Arabic labels and shows the Arabic required error', async () => {
    renderForm();
    const user = userEvent.setup();

    expect(screen.getByLabelText('الاسم (بالفرنسية)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(await screen.findAllByText('هذا الحقل مطلوب')).toHaveLength(2);
  });
});

describe('SubjectForm — server field errors', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('shows an inline error on the code field for a duplicate-code rejection', async () => {
    render(
      <SubjectForm
        formId="subject-form"
        defaultValues={EMPTY_SUBJECT_INPUT}
        onSubmit={vi.fn()}
        serverCodeError={{ code: 'duplicate-subject-code' }}
      />,
    );

    expect(
      await screen.findByText('Ce code est déjà utilisé par une autre matière'),
    ).toBeInTheDocument();
  });

  it('clears the server error as soon as the code field is edited', async () => {
    render(
      <SubjectForm
        formId="subject-form"
        defaultValues={EMPTY_SUBJECT_INPUT}
        onSubmit={vi.fn()}
        serverCodeError={{ code: 'duplicate-subject-code' }}
      />,
    );
    const user = userEvent.setup();

    expect(await screen.findByText('Ce code est déjà utilisé par une autre matière')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Code (optionnel)'), 'M');

    expect(screen.queryByText('Ce code est déjà utilisé par une autre matière')).not.toBeInTheDocument();
  });

  it('re-applies the inline error when a fresh identical rejection arrives after an edit', async () => {
    const { rerender } = render(
      <SubjectForm
        formId="subject-form"
        defaultValues={EMPTY_SUBJECT_INPUT}
        onSubmit={vi.fn()}
        serverCodeError={{ code: 'duplicate-subject-code' }}
      />,
    );
    const user = userEvent.setup();
    const errorText = 'Ce code est déjà utilisé par une autre matière';

    expect(await screen.findByText(errorText)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Code (optionnel)'), 'M');
    expect(screen.queryByText(errorText)).not.toBeInTheDocument();

    rerender(
      <SubjectForm
        formId="subject-form"
        defaultValues={EMPTY_SUBJECT_INPUT}
        onSubmit={vi.fn()}
        serverCodeError={{ code: 'duplicate-subject-code' }}
      />,
    );

    expect(await screen.findByText(errorText)).toBeInTheDocument();
  });
});
