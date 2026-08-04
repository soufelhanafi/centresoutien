import type { Brand } from '../value-objects/brand';

/** ULID id prefix for security-question rows: `secq_01HW…`. */
export const SECURITY_QUESTION_ID_PREFIX = 'secq';

export type SecurityQuestionId = Brand<string, 'SecurityQuestionId'>;

/**
 * The fixed bank of question keys offered by the setup form. Deliberately
 * avoids family/pet-style prompts (SOU-155's caveat: staff and parents at a
 * small center often know each other well enough that those are guessable) in
 * favor of facts a colleague is unlikely to know offhand. The question text
 * itself is UI copy — `fr.json` / `ar.json` map each key to a translated
 * prompt; the domain only knows the stable key.
 */
export const SECURITY_QUESTION_KEYS = [
  'first-employer',
  'childhood-street',
  'first-car',
  'favorite-teacher',
  'birth-city',
  'first-phone-last-four',
  'first-job-title',
  'childhood-best-friend',
] as const;

export type SecurityQuestionKey = (typeof SECURITY_QUESTION_KEYS)[number];

/**
 * One of the three security questions set at account setup (SOU-155), the
 * tertiary password-reset path for when there's no recovery code and no
 * internet access. `answerHash` is an Argon2id PHC string produced by the
 * same {@link PasswordHasher} port used for the admin password and recovery
 * codes — the domain never stores or inspects the plaintext answer. Local
 * infra like `AdminAccount` and `RecoveryCode`: device-local, no sync
 * envelope, never travels to the hub.
 */
export type SecurityQuestion = {
  readonly id: SecurityQuestionId;
  readonly questionKey: SecurityQuestionKey;
  answerHash: string;
  readonly createdAt: Date;
  updatedAt: Date;
};
