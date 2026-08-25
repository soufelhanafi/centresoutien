import { useMutation } from '@tanstack/react-query';
import type { RecoverPasswordWithSetupCodeInput } from '@centresoutien/domain';
import { usersGateway } from '../../lib/users/users-gateway';

/**
 * Recovery redemption (SOU-303): an already-onboarded staff member redeems a
 * director-reissued code to set a NEW password. Runs from the login screen before
 * any session exists, so it invalidates no cached query.
 */
export function useRecoverPassword() {
  return useMutation({
    mutationFn: (input: RecoverPasswordWithSetupCodeInput) => usersGateway.recoverPassword(input),
  });
}
