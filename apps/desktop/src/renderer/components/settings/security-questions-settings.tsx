import { useTranslation } from 'react-i18next';
import { ShieldQuestion } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorState, Skeleton } from '@centresoutien/ui';
import { useSecurityQuestionsBank } from '../../hooks/settings/use-security-questions-bank';
import { useSecurityQuestionsExists } from '../../hooks/settings/use-security-questions-exists';
import { SecurityQuestionsForm } from './security-questions-form';

/**
 * Security-questions section of the Settings page (SOU-155). Loads the
 * question bank and whether questions are already set before rendering the
 * form — both are needed up front, so the section stays in a loading/error
 * state until both queries settle.
 */
export function SecurityQuestionsSettings() {
  const { t } = useTranslation();
  const bankQuery = useSecurityQuestionsBank();
  const existsQuery = useSecurityQuestionsExists();

  const isPending = bankQuery.isPending || existsQuery.isPending;
  const isError = bankQuery.isError || existsQuery.isError;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.securityQuestions.title')}</CardTitle>
        <CardDescription>{t('settings.securityQuestions.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {isError && (
          <ErrorState
            icon={<ShieldQuestion className="h-5 w-5" aria-hidden="true" />}
            title={t('settings.securityQuestions.loadErrorTitle')}
            description={t('settings.securityQuestions.loadErrorBody')}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void bankQuery.refetch();
                  void existsQuery.refetch();
                }}
              >
                {t('settings.securityQuestions.retry')}
              </Button>
            }
          />
        )}

        {!isPending && !isError && bankQuery.data && existsQuery.data && (
          <>
            {existsQuery.data.exists && (
              <p className="text-sm text-muted-foreground">{t('settings.securityQuestions.alreadySetNotice')}</p>
            )}
            <SecurityQuestionsForm bank={bankQuery.data.keys} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
