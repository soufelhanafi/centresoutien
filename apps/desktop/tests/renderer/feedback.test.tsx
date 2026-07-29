import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, LockOverlay } from '@centresoutien/ui';

describe('LockOverlay', () => {
  it('renders the locked feature title and description', () => {
    render(
      <LockOverlay title="Paie enseignants" description="Calculez les règlements automatiquement.">
        <p>contenu</p>
      </LockOverlay>,
    );
    expect(screen.getByText('Paie enseignants')).toBeInTheDocument();
    expect(screen.getByText('Calculez les règlements automatiquement.')).toBeInTheDocument();
  });

  it('hides the blurred content from assistive technology and the tab order', () => {
    render(
      <LockOverlay title="Paie enseignants">
        <p>contenu</p>
      </LockOverlay>,
    );
    const body = screen.getByText('contenu');
    expect(body.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(body.closest('[inert]')).not.toBeNull();
  });

  it('calls onCta when the upgrade button is pressed', async () => {
    const onCta = vi.fn();
    render(
      <LockOverlay title="Paie enseignants" ctaLabel="Voir les plans" onCta={onCta}>
        <p>contenu</p>
      </LockOverlay>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Voir les plans' }));
    expect(onCta).toHaveBeenCalledOnce();
  });

  it('renders no button when ctaLabel is supplied without onCta', () => {
    render(
      <LockOverlay title="Paie enseignants" ctaLabel="Voir les plans">
        <p>contenu</p>
      </LockOverlay>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        title="Aucune matière configurée"
        description="Commencez par ajouter les matières que votre centre enseigne."
        action={<button type="button">+ Ajouter une matière</button>}
      />,
    );
    expect(screen.getByText('Aucune matière configurée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Ajouter une matière' })).toBeInTheDocument();
  });

  it('renders the icon wrapped in an aria-hidden tile', () => {
    render(
      <EmptyState
        title="Aucune matière configurée"
        icon={<svg data-testid="empty-state-icon" />}
      />,
    );
    const icon = screen.getByTestId('empty-state-icon');
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
