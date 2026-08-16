import type { CreateUserInput, RedeemSetupCodeInput } from '@centresoutien/domain';
import type { UserView } from './user-view';
import { ipcUsersGateway } from './ipc-users-gateway';

/**
 * The result of inviting an employee: the created account's safe view plus the
 * ONE-TIME setup code, which crosses the boundary exactly once (SOU-256). No
 * channel can read it again, so the renderer must surface it before this object
 * is dropped.
 */
export type CreateUserResult = { readonly user: UserView; readonly setupCode: string };

/**
 * The seam the user-management UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete IPC adapter is
 * swappable in one place. `list` backs the team roster; `create` invites an
 * employee; `redeemSetupCode` is the first-login redemption an invited employee
 * runs from the login screen.
 */
export interface UsersGateway {
  list(): Promise<readonly UserView[]>;
  create(input: CreateUserInput): Promise<CreateUserResult>;
  redeemSetupCode(input: RedeemSetupCodeInput): Promise<void>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const usersGateway: UsersGateway = ipcUsersGateway;
