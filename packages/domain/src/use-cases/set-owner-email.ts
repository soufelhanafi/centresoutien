import type { UserRepository } from '../ports/user-repository';
import type { Clock } from '../ports/clock';
import { applyWrite } from '../entities/write';
import { normalizeEmail } from '../value-objects/email';
import { UserNotFoundError } from '../errors/user-errors';
import type { User } from '../entities/user';

// The raw command: `null` (or blank) clears the address, a non-empty string is
// validated + normalized by the Email VO. Renderer input is untrusted, so the
// string is parsed here, never trusted as already-canonical.
export type SetOwnerEmailInput = {
  readonly email: string | null;
};

/**
 * Sets (or clears) the center owner's optional contact email (SOU-157) — the
 * address the future password-reset-by-email relay sends to. The single domain
 * write path for the account email: validation lives in the {@link normalizeEmail}
 * VO, and the change flows through {@link applyWrite} so a real edit bumps
 * `updatedAt`/`updatedBy` and lands in the per-field change log exactly like any
 * other editable people-field; a no-op patch (same address again) produces no sync
 * delta. `null`/blank clears the address to `null`.
 *
 * Owner-scoped: the single-owner MVP resolves the target with `findOwner()`, and
 * the owner is its own last editor (`updatedBy = owner.id`), consistent with
 * first-run owner creation. Does not touch the password or any credential field.
 */
export class SetOwnerEmail {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: SetOwnerEmailInput): Promise<User> {
    const owner = await this.users.findOwner();
    if (owner === null) throw new UserNotFoundError();

    const email = input.email === null || input.email.trim() === '' ? null : normalizeEmail(input.email);

    const { next, changedFields } = applyWrite(owner, { email }, { clock: this.clock, updatedBy: owner.id });
    if (changedFields.length === 0) return owner;

    await this.users.save(next);
    return next;
  }
}
