import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CenterProfileInput } from '@centresoutien/domain';
import { centerProfileQueryKey } from './use-center-profile';

/** The editable profile plus the logo reference produced by a prior upload. */
export type SaveCenterProfileInput = CenterProfileInput & {
  logoPath: string | null;
};

/**
 * Upserts the center profile over the typed IPC bridge (SOU-28). `plan` is
 * never sent — it is display-only, seeded once by the domain. On success the
 * center query is invalidated so Settings reflects the canonical row.
 */
export function useSaveCenterProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCenterProfileInput) => window.api.invoke('center.save', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: centerProfileQueryKey }),
  });
}
