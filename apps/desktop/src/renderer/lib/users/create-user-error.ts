import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors `user.create` raises (SOU-256), as the renderer must handle them.
 * The domain throws these with a stable `code`; the renderer decodes it from the
 * IPC rejection (see `resolveDomainErrorCode`) and localizes a fixed line via
 * `t(\`errors.${code}\`)`. `username-already-taken` maps to the username field;
 * the two role codes are defensive (the picker only offers invitable roles) and
 * fall back to a toast. Mirrors `mapSubjectWriteError`.
 */
export type CreateUserErrorCode = 'username-already-taken' | 'invalid-user-role' | 'role-not-invitable';

const CODES = new Set<string>([
  'username-already-taken',
  'invalid-user-role',
  'role-not-invitable',
] satisfies CreateUserErrorCode[]);

export function mapCreateUserError(error: unknown): CreateUserErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as CreateUserErrorCode) : null;
}
