import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KindBadge, PlanBadge, StatusBadge, type InvoiceStatusTone } from '@centresoutien/ui';

describe('StatusBadge', () => {
  it('renders the supplied label', () => {
    render(<StatusBadge status="paid" label="Payée" />);
    expect(screen.getByText('Payée')).toBeInTheDocument();
  });

  it.each<[InvoiceStatusTone, string, string]>([
    ['draft', 'Brouillon', '--badge-warning-bg'],
    ['paid', 'Payée', '--badge-success-bg'],
    ['partially-paid', 'Payée partiellement', '--badge-info-bg'],
    ['cancelled', 'Annulée', '--badge-destructive-bg'],
  ])('maps status "%s" to its design role (%s)', (status, label, roleToken) => {
    const { container } = render(<StatusBadge status={status} label={label} />);
    expect(container.firstElementChild?.className).toContain(roleToken);
  });
});

describe('KindBadge', () => {
  it('gives exam-prep a dashed border so it is always separable', () => {
    const { container } = render(<KindBadge kind="exam-prep" label="PE · Prépa examens" />);
    expect(container.firstElementChild?.className).toContain('border-dashed');
  });

  it('does not make regular dashed', () => {
    const { container } = render(<KindBadge kind="regular" label="Régulier" />);
    expect(container.firstElementChild?.className).not.toContain('border-dashed');
  });

  it('renders its own kind tokens and not Badge\'s neutral-variant colours', () => {
    const { container } = render(<KindBadge kind="exam-prep" label="PE · Prépa examens" />);
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('--kind-exam-bg');
    expect(className).toContain('--kind-exam-fg');
    expect(className).toContain('--kind-exam-border');
    expect(className).not.toContain('--badge-neutral-bg');
    expect(className).not.toContain('--badge-neutral-border');
  });
});

describe('PlanBadge', () => {
  it('falls back to the tier name when no label is given', () => {
    render(<PlanBadge tier="premium" />);
    expect(screen.getByText('PREMIUM')).toBeInTheDocument();
  });

  it('renders the premium gradient token and not Badge\'s neutral-variant background', () => {
    const { container } = render(<PlanBadge tier="premium" />);
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('--plan-premium-bg');
    expect(className).not.toContain('--badge-neutral-bg');
    expect(className).not.toContain('--badge-neutral-border');
  });

  it('drops Badge\'s base border for essentiel and pro tiers too', () => {
    const { container: essentiel } = render(<PlanBadge tier="essentiel" />);
    const { container: pro } = render(<PlanBadge tier="pro" />);
    expect(essentiel.firstElementChild?.className).not.toContain('--badge-neutral-bg');
    expect(pro.firstElementChild?.className).not.toContain('--badge-neutral-bg');
  });
});
