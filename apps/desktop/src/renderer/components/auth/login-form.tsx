import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { loginInputSchema } from '@centresoutien/domain';
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useLogin } from '../../hooks/auth/use-login';
import { LockoutNotice } from './lockout-notice';

// `rememberDevice` is a plain toggle here — always present, defaulted by the
// checkbox — so we drop the domain schema's `.default()` to keep the form's input
// and output types identical (RHF's resolver inference needs them to match). The
// username/password validation codes stay the domain's, resolved via `errors.*`.
const loginFormSchema = loginInputSchema.extend({ rememberDevice: z.boolean() });

type LoginFormValues = z.infer<typeof loginFormSchema>;

/** What the last attempt told us: nothing yet, wrong creds, or a live lock. */
type Feedback =
  | { readonly kind: 'invalid'; readonly remaining: number }
  | { readonly kind: 'locked'; readonly untilMs: number }
  | null;

/**
 * The login form (SOU-27): username, password, and a "remember this device"
 * toggle. Field validation is the shared domain schema (codes resolved to FR/AR
 * via `errors.*`); the throttle outcome — wrong-with-tries-left or locked — is a
 * normal result rendered inline, not a thrown error. On success it hands control
 * back to the gate. While locked, the whole form is disabled until the countdown
 * elapses.
 */
export function LoginForm({
  onAuthenticated,
  onForgotPassword,
}: {
  onAuthenticated: () => void;
  onForgotPassword: () => void;
}) {
  const { t } = useTranslation();
  const login = useLogin();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { username: '', password: '', rememberDevice: false },
  });

  const clearLock = useCallback(() => setFeedback(null), []);
  const isLocked = feedback?.kind === 'locked';

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await login.mutateAsync(values);
    switch (result.outcome) {
      case 'success':
        onAuthenticated();
        return;
      case 'invalid-credentials':
        setFeedback({ kind: 'invalid', remaining: result.remainingAttempts });
        form.resetField('password');
        return;
      case 'locked-out':
        setFeedback({ kind: 'locked', untilMs: result.lockedUntilMs });
        return;
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.username')}</FormLabel>
              <FormControl>
                <Input autoComplete="username" autoFocus disabled={isLocked} {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.password')}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  disabled={isLocked}
                  {...field}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="rememberDevice"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  disabled={isLocked}
                />
              </FormControl>
              <FormLabel className="cursor-pointer text-sm font-normal">
                {t('auth.rememberDevice')}
              </FormLabel>
            </FormItem>
          )}
        />

        {feedback?.kind === 'invalid' ? (
          <p role="alert" className="text-sm text-destructive">
            {t('auth.invalidCredentials')}{' '}
            {t('auth.attemptsRemaining', { count: feedback.remaining })}
          </p>
        ) : null}

        {feedback?.kind === 'locked' ? (
          <LockoutNotice untilMs={feedback.untilMs} onElapsed={clearLock} />
        ) : null}

        {login.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('auth.error')}
          </p>
        ) : null}

        <Button type="submit" disabled={isLocked || login.isPending}>
          {login.isPending ? t('auth.submitting') : t('auth.submit')}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-center"
          onClick={onForgotPassword}
        >
          {t('auth.forgot.link')}
        </Button>
      </form>
    </Form>
  );
}
