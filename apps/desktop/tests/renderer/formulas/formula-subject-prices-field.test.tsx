import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormulaForm, EMPTY_FORMULA_INPUT } from '../../../src/renderer/components/formula/formula-form';
import type { FormulaWriteInput } from '../../../src/renderer/lib/formulas/formula-view';
import i18n from '../../../src/renderer/i18n/config';

const MATH = { id: 'sub_01ARZ3NDEKTSV4RRFFQ69G5FAV', name: { fr: 'Mathématiques', ar: 'الرياضيات' }, code: 'MATH', active: true };
const PHYS = { id: 'sub_01ARZ3NDEKTSV4RRFFQ69G5FB0', name: { fr: 'Physique', ar: 'الفيزياء' }, code: 'PHYS', active: true };

function renderForm(onSubmit: (values: FormulaWriteInput) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <FormulaForm formId="formula-form" defaultValues={EMPTY_FORMULA_INPUT} onSubmit={onSubmit} />
      <button type="submit" form="formula-form">
        submit
      </button>
    </QueryClientProvider>
  );
  return render(ui);
}

/** The per-subject price <input> (a number spinbutton), disambiguated from the multi-select checkbox that shares the subject's label. */
function priceInputFor(name: string): HTMLElement {
  const controls = screen.getAllByLabelText(name);
  const input = controls.find((el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'number');
  if (!input) throw new Error(`no price input for ${name}`);
  return input;
}

async function pickBothSubjectsAndTotal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('checkbox', { name: 'Mathématiques' }));
  await user.click(screen.getByRole('checkbox', { name: 'Physique' }));
  await user.type(screen.getByLabelText('Nom (français)'), 'Math + Physique');
  await user.type(screen.getByLabelText('Prix mensuel (MAD)'), '350');
}

describe('FormulaSubjectPricesField', () => {
  beforeEach(async () => {
    window.api.invoke = vi.fn().mockResolvedValue({ subjects: [MATH, PHYS] });
    await i18n.changeLanguage('fr');
  });

  afterEach(() => vi.restoreAllMocks());

  it('sends an empty subjectPrices map when the per-subject toggle stays off (clears to equal-split)', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(onSubmit);
    await pickBothSubjectsAndTotal(user);

    await user.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // An explicit [] (not an omission) so UpdateFormula clears any existing map
    // back to the equal-split default rather than keeping a stale one (SOU-298).
    expect(onSubmit.mock.calls[0][0].subjectPrices).toEqual([]);
  });

  it('blocks submit and shows an error when the per-subject prices do not sum to the total', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(onSubmit);
    await pickBothSubjectsAndTotal(user);

    await user.click(screen.getByLabelText('Répartir le prix par matière'));
    await user.type(priceInputFor('Mathématiques'), '200');
    await user.type(priceInputFor('Physique'), '100');

    expect(await screen.findByText('La somme des prix par matière doit être égale au prix total')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'submit' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks submit while a selected subject has no price (must be > 0)', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(onSubmit);
    await pickBothSubjectsAndTotal(user);

    await user.click(screen.getByLabelText('Répartir le prix par matière'));
    await user.type(priceInputFor('Mathématiques'), '350');

    expect(await screen.findByText('Chaque prix par matière doit être supérieur à 0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'submit' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the price map (centimes) when it covers every subject and sums to the total', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(onSubmit);
    await pickBothSubjectsAndTotal(user);

    await user.click(screen.getByLabelText('Répartir le prix par matière'));
    await user.type(priceInputFor('Mathématiques'), '200');
    await user.type(priceInputFor('Physique'), '150');

    await user.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].subjectPrices).toEqual([
      { subjectId: MATH.id, priceMad: 20000 },
      { subjectId: PHYS.id, priceMad: 15000 },
    ]);
  });

  it('shows the live sum-of-total hint', async () => {
    const user = userEvent.setup();
    renderForm(vi.fn());
    await pickBothSubjectsAndTotal(user);

    await user.click(screen.getByLabelText('Répartir le prix par matière'));
    await user.type(priceInputFor('Mathématiques'), '200');

    const section = screen.getByText('Somme des matières').closest('div');
    expect(section && within(section).getByText(/sur/)).toBeTruthy();
  });
});
