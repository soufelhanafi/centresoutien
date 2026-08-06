import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLANS } from '@centresoutien/domain';
import { PlanSettings } from '../../../src/renderer/components/settings/plan-settings';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';

describe('Plan settings — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('shows the Essentiel badge, unlimited limits, and every feature except Multi-centres', () => {
    // SOU-83 MVP collapse: Essentiel now carries every feature and unlimited limits;
    // org.multi-center (Multi-centres) is the only flag it still lacks.
    usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
    render(<PlanSettings />);

    expect(screen.getByText('ESSENTIEL')).toBeInTheDocument();
    expect(screen.getAllByText('Illimité').length).toBeGreaterThan(0);
    expect(screen.getByText('Gestion des salles')).toBeInTheDocument();
    expect(screen.getByText('Paiements partiels')).toBeInTheDocument();
    expect(screen.queryByText('Multi-centres')).not.toBeInTheDocument();
  });

  it('shows unlimited limits and Premium-only features for the Premium plan', () => {
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    render(<PlanSettings />);

    expect(screen.getByText('PREMIUM')).toBeInTheDocument();
    expect(screen.getAllByText('Illimité').length).toBeGreaterThan(0);
    expect(screen.getByText('Multi-centres')).toBeInTheDocument();
  });
});

describe('Plan settings — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders Arabic labels and the unlimited badge', () => {
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    render(<PlanSettings />);

    expect(screen.getByText('باقتك')).toBeInTheDocument();
    expect(screen.getAllByText('غير محدود').length).toBeGreaterThan(0);
    expect(screen.getByText('مراكز متعددة')).toBeInTheDocument();
  });
});
