import { useMutation } from '@tanstack/react-query';
import type { RedeemSetupCodeInput } from '@centresoutien/domain';
import { usersGateway } from '../../lib/users/users-gateway';

/**
 * First-login redemption (SOU-256): an invited employee proves they hold the
 * one-time setup code and sets their own password. Runs from the login screen
 * before any session exists, so it invalidates no cached query.
 */
export function useRedeemSetupCode() {
  return useMutation({
    mutationFn: (input: RedeemSetupCodeInput) => usersGateway.redeemSetupCode(input),
  });
}
