import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useForm, type Resolver } from 'react-hook-form';
import { Form } from '@centresoutien/ui';
import type { CenterProfileInput } from '@centresoutien/domain';
import {
  CenterProfileFields,
  type CenterProfileFormValues,
} from '../../../src/renderer/components/settings/center-profile-fields';
import i18n from '../../../src/renderer/i18n/config';

// Stands in for the domain schema emitting the `invalid-phone` code (backend
// contract): any submit fails phone validation with that stable code. This keeps
// the frontend assertion — code → inline translated message — independent of
// whether the domain refine has merged yet.
const invalidPhoneResolver: Resolver<CenterProfileFormValues, unknown, CenterProfileInput> = async (
  values,
) => ({
  values: { name: 'Centre', address: '', phone: values.phone ?? '', email: '' },
  errors: { phone: { type: 'custom', message: 'invalid-phone' } },
});

function PhoneHarness() {
  const form = useForm<CenterProfileFormValues, unknown, CenterProfileInput>({
    resolver: invalidPhoneResolver,
    defaultValues: { name: 'Centre', address: '', phone: '123', email: '' },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})} noValidate>
        <CenterProfileFields control={form.control} />
        <button type="submit">go</button>
      </form>
    </Form>
  );
}

describe('Phone field — invalid-phone inline error (B1)', () => {
  it('renders the French message when the phone code is invalid-phone', async () => {
    await i18n.changeLanguage('fr');
    const user = userEvent.setup();
    render(<PhoneHarness />);

    await user.click(screen.getByRole('button', { name: 'go' }));

    expect(await screen.findByText('Numéro de téléphone invalide')).toBeInTheDocument();
  });

  it('renders the Arabic message when the phone code is invalid-phone', async () => {
    await i18n.changeLanguage('ar');
    const user = userEvent.setup();
    render(<PhoneHarness />);

    await user.click(screen.getByRole('button', { name: 'go' }));

    expect(await screen.findByText('رقم الهاتف غير صالح')).toBeInTheDocument();
  });
});
