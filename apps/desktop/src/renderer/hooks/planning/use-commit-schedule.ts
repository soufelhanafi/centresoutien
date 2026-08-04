import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  sessionGeneratorGateway,
  type GeneratorCommitInput,
  type GeneratorCommitResult,
} from '../../lib/planning/session-generator-gateway';
import { plannerKeys } from './keys';

/**
 * Commits a confirmed generator preview (SOU-159): sends the echoed proposals +
 * window to `session.generator.commit`, which persists one recurring template
 * per block and materializes its dated occurrences. On success it invalidates
 * the planner week query so the new sessions appear in the grid without a reload
 * (same pattern as `useCreateSession`). A conflict partway through aborts the
 * rest server-side; the caller surfaces it via `mapGeneratorError`.
 */
export function useCommitSchedule() {
  const queryClient = useQueryClient();
  return useMutation<GeneratorCommitResult, unknown, GeneratorCommitInput>({
    mutationFn: (input) => sessionGeneratorGateway.commit(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}
