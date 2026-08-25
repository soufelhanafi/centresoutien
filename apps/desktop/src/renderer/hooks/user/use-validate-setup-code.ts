import { useMutation } from '@tanstack/react-query';
import type { ValidateSetupCodeInput } from '@centresoutien/domain';
import { usersGateway } from '../../lib/users/users-gateway';

/**
 * Step 1 of the code-first redemption (SOU-303): proves the setup code alone and
 * returns the role bound to it plus whether identity must still be collected. Runs
 * from the login screen before any session exists, so it invalidates no query.
 */
export function useValidateSetupCode() {
  return useMutation({
    mutationFn: (input: ValidateSetupCodeInput) => usersGateway.validateSetupCode(input),
  });
}
