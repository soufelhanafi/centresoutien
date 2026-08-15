import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddEmployeeForm } from '../../src/renderer/components/settings/team/add-employee-form';
import i18n from '../../src/renderer/i18n/config';

/**
 * `AddEmployeeForm` is presentation-only (SOU-256): it owns no mutation, so it is
 * exercised with an external submit button bound via `form={formId}` — exactly
 * how `AddEmployeeDialog` wires its footer button outside the form.
 */
function renderForm(props: Partial<React.ComponentProps<typeof AddEmployeeForm>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  render(
    <>
      <AddEmployeeForm formId="employee-form" onSubmit={onSubmit} {...props} />
      <button type="submit" form="employee-form">
        submit
      </button>
    </>,
  );
  return onSubmit;
}

describe('AddEmployeeForm — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('requires a username and does not call onSubmit when empty', async () => {
    const onSubmit = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(await screen.findByText("Nom d'utilisateur trop court")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the username with the default invitable role', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'fatima.secretaire');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ username: 'fatima.secretaire', role: 'secretary' }),
    );
  });

  it('shows an inline error on the username field for a taken-username rejection', async () => {
    renderForm({ serverFieldError: { field: 'username', code: 'username-already-taken' } });

    expect(await screen.findByText("Ce nom d'utilisateur est déjà utilisé")).toBeInTheDocument();
  });
});

describe('AddEmployeeForm — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders Arabic labels', async () => {
    renderForm();
    expect(screen.getByLabelText('اسم المستخدم')).toBeInTheDocument();
  });
});
