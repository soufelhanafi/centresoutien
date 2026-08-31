import type { PermissionFlag } from '@centresoutien/domain';
import { useSession } from './auth/use-session';

/**
 * True when the signed-in account may see the screen behind `flag`
 * (assistant-visibility): always true for `role: 'owner'`, otherwise whether the
 * owner left `flag` checked for this employee. Cosmetic only — the IPC layer is
 * the real gate (`requireUserPermission`); this only decides what the renderer
 * shows.
 *
 * Same optional-flag convenience as `useOptionalFeature`: `flag` may be
 * `undefined` for an ungated surface, in which case this returns `true`.
 */
export function useUserPermission(flag?: PermissionFlag): boolean {
  const { data } = useSession();
  if (flag === undefined) return true;
  if (data === undefined || !data.authenticated || data.role === null) return false;
  if (data.role === 'owner') return true;
  return (data.permissions ?? []).includes(flag);
}
