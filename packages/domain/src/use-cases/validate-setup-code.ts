import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { Role } from '../value-objects/role';
import { validateSetupCodeInputSchema, type ValidateSetupCodeInput } from '../schemas/user';
import { hasEstablishedIdentity } from '../entities/user';
import { resolvePendingInviteByCode } from './pending-invite';
import { SetupCodeExpiredError } from '../errors/user-errors';

// The authorization outcome of a setup code (SOU-303): the role bound to it and
// whether this is a first onboarding (identity must be collected) or a director
// re-issued recovery code for an already-onboarded account (only a new password).
export type ValidatedSetupCode = {
  readonly role: Role;
  readonly needsIdentity: boolean;
};

// Step 1 of the code-first flow (SOU-303): validate the code ALONE, before the
// staff type any identity. Resolving the invite proves the code and surfaces the
// role bound to it — the role is never self-asserted at step 2. This is a read-only
// peek; it commits nothing, so the single-use compare-and-set still happens only at
// redemption. Invalid/expired codes throw the same opaque errors as redemption so
// step 1 leaks no more than step 2.
export class ValidateSetupCode {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: ValidateSetupCodeInput): Promise<ValidatedSetupCode> {
    const { setupCode } = validateSetupCodeInputSchema.parse(input);

    const now = this.clock.now();
    const { user } = await resolvePendingInviteByCode(this.users, this.hasher, setupCode);
    if (user.setupCodeExpiresAt === null || now.getTime() > user.setupCodeExpiresAt) {
      throw new SetupCodeExpiredError();
    }

    return { role: user.role, needsIdentity: !hasEstablishedIdentity(user) };
  }
}
