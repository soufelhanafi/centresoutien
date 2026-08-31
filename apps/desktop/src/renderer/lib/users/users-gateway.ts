import type {
  CreateUserInput,
  RedeemSetupCodeInput,
  ValidateSetupCodeInput,
  ValidatedSetupCode,
  RecoverPasswordWithSetupCodeInput,
  PermissionFlag,
} from '@centresoutien/domain';
import type { UserView } from './user-view';
import { ipcUsersGateway } from './ipc-users-gateway';

/**
 * The result of re-issuing an existing account's recovery code: the account's safe
 * view plus the ONE-TIME setup code, which crosses the boundary exactly once
 * (SOU-303). No channel can read it again, so the renderer must surface it before
 * this object is dropped.
 */
export type ReissueResult = { readonly user: UserView; readonly setupCode: string };

/**
 * The seam the user-management UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete IPC adapter is
 * swappable in one place. `list` backs the team roster; `create` creates an
 * employee with director-set credentials (born active — no code); `reissue`
 * re-opens an existing account's recovery setup code. The redemption trio runs from
 * the login screen with no session: `validateSetupCode` proves the code alone
 * (step 1), then `redeemSetupCode` (first onboarding — captures identity) or
 * `recoverPassword` (already-onboarded — password only) commits it.
 * `updatePermissions` backs the team roster's per-account permission switches
 * (assistant-visibility) — sends the whole desired set, not a single toggle.
 */
export interface UsersGateway {
  list(): Promise<readonly UserView[]>;
  create(input: CreateUserInput): Promise<UserView>;
  reissue(userId: string): Promise<ReissueResult>;
  validateSetupCode(input: ValidateSetupCodeInput): Promise<ValidatedSetupCode>;
  redeemSetupCode(input: RedeemSetupCodeInput): Promise<void>;
  recoverPassword(input: RecoverPasswordWithSetupCodeInput): Promise<void>;
  updatePermissions(userId: string, permissions: readonly PermissionFlag[]): Promise<UserView>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const usersGateway: UsersGateway = ipcUsersGateway;
