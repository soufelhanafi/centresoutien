import type { CreateUserInput, RedeemSetupCodeInput } from '@centresoutien/domain';
import type { UserView } from './user-view';
import type { CreateUserResult, UsersGateway } from './users-gateway';

/**
 * The real {@link UsersGateway}: maps each method onto its typed IPC channel
 * (SOU-256 user.list / user.create / user.redeemSetupCode). No business logic —
 * the domain use cases behind the channels own it. `create` echoes back the
 * one-time `setupCode` unchanged so the caller can show it once and then discard
 * it. Mirrors `IpcSubjectsGateway`.
 */
class IpcUsersGateway implements UsersGateway {
  async list(): Promise<readonly UserView[]> {
    const { users } = await window.api.invoke('user.list', {});
    return users;
  }

  async create(input: CreateUserInput): Promise<CreateUserResult> {
    const { user, setupCode } = await window.api.invoke('user.create', input);
    return { user, setupCode };
  }

  async redeemSetupCode(input: RedeemSetupCodeInput): Promise<void> {
    await window.api.invoke('user.redeemSetupCode', input);
  }
}

export const ipcUsersGateway: UsersGateway = new IpcUsersGateway();
