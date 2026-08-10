import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OverrideForm } from '../../../src/renderer/components/center-hours-overrides/override-form';
import i18n from '../../../src/renderer/i18n/config';

/**
 * `OverrideForm` is presentation-only (SOU-165): it owns no mutation, so it is
 * exercised with an external submit button bound via `form={formId}` — exactly how
 * the override dialog wires its footer button outside the form. These specs pin the
 * QA S2a/S2b fix: the day-level overlap error and the per-window close≤open error
 * must render inline (role=alert / aria-invalid) in both locales.
 */
function renderForm(onSubmit = vi.fn()) {
  render(
    <>
      <OverrideForm formId="override-form" onSubmit={onSubmit} />
      <button type="submit" form="override-form">
        submit
      </button>
    </>,
  );
  return onSubmit;
}

function fillValidDates(startLabel: string, endLabel: string) {
  fireEvent.change(screen.getByLabelText(startLabel), { target: { value: '2026-03-01' } });
  fireEvent.change(screen.getByLabelText(endLabel), { target: { value: '2026-03-30' } });
}

describe('OverrideForm — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('renders an inline day-level error for overlapping windows (S2a)', async () => {
    const onSubmit = renderForm();
    const user = userEvent.setup();

    fillValidDates('Date de début', 'Date de fin');
    await user.click(screen.getByRole('switch', { name: 'Ouvert le Lundi' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un créneau' }));
    await user.click(screen.getByRole('button', { name: 'submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Les créneaux d'un même jour ne doivent pas se chevaucher");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders an inline per-window error when close is not after open (S2b)', async () => {
    const onSubmit = renderForm();
    const user = userEvent.setup();

    fillValidDates('Date de début', 'Date de fin');
    await user.click(screen.getByRole('switch', { name: 'Ouvert le Lundi' }));
    fireEvent.change(screen.getByLabelText('Fermeture'), { target: { value: '08:00' } });
    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(await screen.findByText("La fermeture doit être après l'ouverture")).toBeInTheDocument();
    expect(screen.getByLabelText('Fermeture')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('OverrideForm — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders the Arabic overlap error inline (S2a)', async () => {
    const onSubmit = renderForm();
    const user = userEvent.setup();

    fillValidDates('تاريخ البداية', 'تاريخ النهاية');
    await user.click(screen.getByRole('switch', { name: 'مفتوح يوم الإثنين' }));
    await user.click(screen.getByRole('button', { name: 'إضافة فترة زمنية' }));
    await user.click(screen.getByRole('button', { name: 'submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('يجب ألّا تتداخل الفترات الزمنية في اليوم نفسه');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders the Arabic per-window close≤open error inline (S2b)', async () => {
    renderForm();
    const user = userEvent.setup();

    fillValidDates('تاريخ البداية', 'تاريخ النهاية');
    await user.click(screen.getByRole('switch', { name: 'مفتوح يوم الإثنين' }));
    fireEvent.change(screen.getByLabelText('الإغلاق'), { target: { value: '08:00' } });
    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(await screen.findByText('يجب أن يكون وقت الإغلاق بعد وقت الفتح')).toBeInTheDocument();
    expect(screen.getByLabelText('الإغلاق')).toHaveAttribute('aria-invalid', 'true');
  });
});
