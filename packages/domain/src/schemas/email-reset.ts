import { z } from 'zod';

/**
 * The new password chosen at the end of the email-verified reset (SOU-273). Same
 * strength rules as the recovery-code reset ({@link
 * import('./recovery-code').resetPasswordWithRecoveryCodeSchema}) so both reset
 * paths land credentials of identical strength — a user must not be able to set a
 * weaker password just by choosing the email route. The stable messages are
 * localized by the renderer via `t(\`errors.${message}\`)`, never surfaced raw.
 */
export const resetPasswordAfterEmailVerificationSchema = z.object({
  newPassword: z
    .string()
    .min(8, { message: 'password-too-short' })
    .max(128, { message: 'password-too-long' })
    .regex(/[a-z]/, { message: 'password-needs-lowercase' })
    .regex(/[A-Z]/, { message: 'password-needs-uppercase' })
    .regex(/[0-9]/, { message: 'password-needs-digit' }),
});

export type ResetPasswordAfterEmailVerificationSchemaInput = z.infer<
  typeof resetPasswordAfterEmailVerificationSchema
>;
