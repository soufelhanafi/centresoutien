import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddEmployeeForm } from '../../src/renderer/components/settings/team/add-employee-form';
import i18n from '../../src/renderer/i18n/config';

/**
 * `AddEmployeeForm` is presentation-only (SOU-303, code-first): a role picker with
 * no mutation, exercised with an external submit button bound via `form={formId}`
 * — exactly how `AddEmployeeDialog` wires its footer button outside the form. The
 * director no longer types any identity; the staff choose it at redemption.
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

  it('renders only the role picker (no identity fields)', () => {
    renderForm();
    expect(screen.getByText('Rôle')).toBeInTheDocument();
    expect(screen.queryByLabelText("Nom d'utilisateur")).not.toBeInTheDocument();
  });

  it('submits the default invitable role, with no identity payload', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'submit' }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ role: 'secretary' }));
  });
});

describe('AddEmployeeForm — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders the Arabic role label', () => {
    renderForm();
    expect(screen.getByText('الدور')).toBeInTheDocument();
  });
});
