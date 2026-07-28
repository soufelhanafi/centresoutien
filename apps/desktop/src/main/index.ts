import { DOMAIN_PACKAGE } from '@centresoutien/domain';

/**
 * Placeholder desktop entry point.
 *
 * The real Electron shell (main / preload / renderer) and the zod-validated
 * typed IPC contract land in SOU-15. This stub exists only so the workspace
 * has a buildable `apps/desktop` target and proves the Presentation → Domain
 * dependency direction resolves.
 */
export function bootstrap(): string {
  return `Centre Soutien desktop stub wired to ${DOMAIN_PACKAGE}`;
}
