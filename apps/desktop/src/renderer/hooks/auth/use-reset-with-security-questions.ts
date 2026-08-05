import { useMutation } from '@tanstack/react-query';
import type { IpcRequest } from '../../../shared/ipc/contract';

type ResetWithSecurityQuestionsInput = IpcRequest<'auth.resetWithSecurityQuestions'>;

/**
 * Verifies the three security-question answers (SOU-156, last-resort path built
 * on SOU-155). The response union — `confirmation-required`, `invalid-answer`, or
 * `locked-out` — is returned, not thrown: answering correctly only *starts* the
 * reset, which completes through the SOU-157 email confirmation, so there is no
 * `success` outcome to render here yet.
 */
export function useResetWithSecurityQuestions() {
  return useMutation({
    mutationFn: (input: ResetWithSecurityQuestionsInput) =>
      window.api.invoke('auth.resetWithSecurityQuestions', input),
  });
}
