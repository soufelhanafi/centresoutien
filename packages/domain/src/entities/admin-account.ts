import type { Brand } from '../value-objects/brand';

/** ULID id prefix for admin accounts: `adm_01HW…`. */
export const ADMIN_ACCOUNT_ID_PREFIX = 'adm';

export type AdminAccountId = Brand<string, 'AdminAccountId'>;

/**
 * The local administrator account used to unlock the app (SOU-26). Auth is a
 * device-local concern: unlike business entities it is **not** synced, so it
 * carries no envelope (`centerCode`, `version`, `deviceOrigin`…) and no
 * `naturalKey` — it never travels to the hub. It lives in its own local infra
 * table, in the same spirit as `app_meta` and `_schema_migrations`.
 *
 * `passwordHash` is an opaque Argon2id PHC string produced by the
 * {@link PasswordHasher} port in the main process; the domain never inspects it
 * and the plaintext password is never stored.
 */
export type AdminAccount = {
  readonly id: AdminAccountId;
  username: string;
  passwordHash: string;
  readonly createdAt: Date;
  updatedAt: Date;
};
