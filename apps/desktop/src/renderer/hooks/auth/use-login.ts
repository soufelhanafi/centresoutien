import { useMutation } from '@tanstack/react-query';
import type { LoginInput } from '@centresoutien/domain';

/**
 * Throttled login over the typed IPC bridge (SOU-27). The mutation resolves to a
 * `LoginResult` union — success, invalid-with-tries-left, or locked-out — rather
 * than throwing, because those are expected outcomes the screen renders. A thrown
 * error means the IPC call itself failed. `rememberDevice` is normalized to a
 * boolean so the request always matches the contract's required shape.
 */
export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput) =>
      window.api.invoke('auth.login', {
        username: input.username,
        password: input.password,
        rememberDevice: input.rememberDevice ?? false,
      }),
  });
}
