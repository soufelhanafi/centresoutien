import type {
  CreateUserInput,
  RedeemSetupCodeInput,
  ValidateSetupCodeInput,
  ValidatedSetupCode,
  RecoverPasswordWithSetupCodeInput,
  PermissionFlag,
} from '@centresoutien/domain';
import type { UserView } from './user-view';
import type { ReissueResult, UsersGateway } from './users-gateway';

/**
 * The real {@link UsersGateway}: maps each method onto its typed IPC channel
 * (SOU-256 / SOU-303). No business logic — the domain use cases behind the channels
 * own it. `create` returns the new active account's safe view (no code — the
 * director set its credentials); `reissue` echoes back the one-time recovery
 * `setupCode` unchanged so the caller can show it once and then discard it. Mirrors
 * `IpcSubjectsGateway`.
 */
class IpcUsersGateway implements UsersGateway {
  async list(): Promise<readonly UserView[]> {
    const { users } = await window.api.invoke('user.list', {});
    return users;
  }

  async create(input: CreateUserInput): Promise<UserView> {
    const { user } = await window.api.invoke('user.create', input);
    return user;
  }

  async reissue(userId: string): Promise<ReissueResult> {
    const { user, setupCode } = await window.api.invoke('user.reissueSetupCode', { userId });
    return { user, setupCode };
  }

  async validateSetupCode(input: ValidateSetupCodeInput): Promise<ValidatedSetupCode> {
    return window.api.invoke('user.validateSetupCode', input);
  }

  async redeemSetupCode(input: RedeemSetupCodeInput): Promise<void> {
    await window.api.invoke('user.redeemSetupCode', input);
  }

  async recoverPassword(input: RecoverPasswordWithSetupCodeInput): Promise<void> {
    await window.api.invoke('user.recoverPassword', input);
  }

  async updatePermissions(userId: string, permissions: readonly PermissionFlag[]): Promise<UserView> {
    const { user } = await window.api.invoke('user.updatePermissions', {
      userId,
      permissions: [...permissions],
    });
    return user;
  }
}

export const ipcUsersGateway: UsersGateway = new IpcUsersGateway();
