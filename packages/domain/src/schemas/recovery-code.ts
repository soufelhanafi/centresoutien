import { z } from 'zod';

const RECOVERY_CODE_GROUP = /^[A-Z0-9]{4}$/;
const RECOVERY_CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const recoveryCodeGroupSchema = z.string().regex(RECOVERY_CODE_GROUP, {
  message: 'recovery-code-invalid-group',
});

export const recoveryCodeSchema = z.string().regex(RECOVERY_CODE, {
  message: 'recovery-code-invalid-format',
});

export type RecoveryCodeString = z.infer<typeof recoveryCodeSchema>;

export const resetPasswordWithRecoveryCodeSchema = z.object({
  recoveryCode: recoveryCodeSchema,
  newPassword: z
    .string()
    .min(8, { message: 'password-too-short' })
    .max(128, { message: 'password-too-long' })
    .regex(/[a-z]/, { message: 'password-needs-lowercase' })
    .regex(/[A-Z]/, { message: 'password-needs-uppercase' })
    .regex(/[0-9]/, { message: 'password-needs-digit' }),
});

export type ResetPasswordWithRecoveryCodeInput = z.infer<
  typeof resetPasswordWithRecoveryCodeSchema
>;
