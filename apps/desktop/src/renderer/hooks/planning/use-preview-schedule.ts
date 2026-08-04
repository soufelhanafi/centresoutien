import { useMutation } from '@tanstack/react-query';
import {
  sessionGeneratorGateway,
  type GeneratorPreviewConfig,
  type GeneratorPreviewResult,
} from '../../lib/planning/session-generator-gateway';

/**
 * Dry-runs the auto-session-generator (SOU-159): sends the config to
 * `session.generator.preview` and returns the proposals + non-blocking conflicts
 * without writing anything. A mutation, not a query — the admin triggers it
 * explicitly from the config step, and re-triggers after editing the config. On
 * an infeasible config or a center with no rooms it throws; the caller maps the
 * code inline via `mapGeneratorError`.
 */
export function usePreviewSchedule() {
  return useMutation<GeneratorPreviewResult, unknown, GeneratorPreviewConfig>({
    mutationFn: (config) => sessionGeneratorGateway.preview(config),
  });
}
