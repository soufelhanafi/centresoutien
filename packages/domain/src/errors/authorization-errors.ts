import { DomainError } from './plan-errors';
import type { Role } from '../value-objects/role';
import type { CenterCode, UserId } from '../value-objects/ids';

/**
 * Thrown when the user has no live membership in the **selected** center — either
 * a genuine non-member, a revoked (tombstoned) membership, or a membership that
 * belongs to a different center. The renderer maps the stable `not-a-center-member`
 * code to a localized `errors.*` message; the domain stays i18n-agnostic.
 */
export class NotACenterMemberError extends DomainError {
  readonly code = 'not-a-center-member';

  constructor(
    readonly userId: UserId,
    readonly centreId: CenterCode,
  ) {
    super(`User "${userId}" has no membership in center "${centreId}".`);
  }
}

/**
 * Thrown when the user IS a member of the selected center but their role ranks
 * below what the action requires (e.g. a `viewer` attempting an `admin` action).
 * Carries both roles so the UI can explain the gap; resolves `insufficient-role`
 * via `t(\`errors.${code}\`)`.
 */
export class InsufficientRoleError extends DomainError {
  readonly code = 'insufficient-role';

  constructor(
    readonly requiredRole: Role,
    readonly actualRole: Role,
  ) {
    super(`Role "${actualRole}" is insufficient — "${requiredRole}" or higher is required.`);
  }
}
