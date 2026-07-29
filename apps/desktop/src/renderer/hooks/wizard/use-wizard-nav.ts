import { useWizardStore } from '../../stores/wizard-store';

/** Bundles the store transitions a step's footer needs, plus whether Back is legal. */
export function useWizardNav() {
  const back = useWizardStore((store) => store.back);
  const submit = useWizardStore((store) => store.submit);
  const skip = useWizardStore((store) => store.skip);
  const canGoBack = useWizardStore((store) => (store.state?.currentIndex ?? 0) > 0);
  return { back, submit, skip, canGoBack };
}
