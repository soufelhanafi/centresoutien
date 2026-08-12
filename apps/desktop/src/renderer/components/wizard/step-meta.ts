import { Languages, Building2, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { WizardStepId } from '@centresoutien/domain';

/**
 * Presentation-only metadata per wizard step. Titles/descriptions are i18n keys
 * (`wizard.steps.<id>.*`), never literal strings, so both locales stay in sync.
 * Ordering itself lives in the domain — this map only decorates it.
 */
export const STEP_META: Record<WizardStepId, { icon: LucideIcon }> = {
  language: { icon: Languages },
  'center-profile': { icon: Building2 },
  'admin-account': { icon: ShieldCheck },
};
