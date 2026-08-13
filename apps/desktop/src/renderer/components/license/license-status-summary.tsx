import { useTranslation } from 'react-i18next';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { Badge, PlanBadge } from '@centresoutien/ui';
import { bcp47, formatDate } from '../../lib/format';
import type { LicenseStatusView } from '../../lib/license/license-contract';

/**
 * Read-only view of the current license (SOU-104): status label, resolved plan,
 * expiry, and centers allowed — plus the two callouts the acceptance criteria
 * require. Trial dates are rendered from main's clock-driven projection; the
 * renderer deliberately never derives trial duration from the browser clock.
 */
export function LicenseStatusSummary({ status }: { status: LicenseStatusView }) {
  const { t, i18n } = useTranslation();
  const isUsable = status.status === 'active' || status.status === 'trial-active';
  const trial = status.trial;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={isUsable ? 'success' : 'destructive'}>
          {isUsable ? (
            <CheckCircle2 className="me-1 h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ShieldAlert className="me-1 h-3.5 w-3.5" aria-hidden="true" />
          )}
          {t(`license.status.values.${status.status}`)}
        </Badge>
        <PlanBadge tier={status.plan} />
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">{t('license.status.expiresAtLabel')}</dt>
          <dd className="text-sm font-semibold text-foreground">
            {status.expiresAt ? formatDate(status.expiresAt, i18n.language) : t('license.status.noExpiry')}
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">{t('license.status.centersAllowedLabel')}</dt>
          <dd className="text-sm font-semibold text-foreground">
            {status.centersAllowed === null
              ? t('license.status.centersUnlimited')
              : new Intl.NumberFormat(bcp47(i18n.language)).format(status.centersAllowed)}
          </dd>
        </div>
      </dl>

      {trial && (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
            <dt className="text-xs text-muted-foreground">{t('license.trial.startedAtLabel')}</dt>
            <dd className="text-sm font-semibold text-foreground">{formatDate(trial.startedAt, i18n.language)}</dd>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
            <dt className="text-xs text-muted-foreground">{t('license.trial.expiresAtLabel')}</dt>
            <dd className="text-sm font-semibold text-foreground">{formatDate(trial.expiresAt, i18n.language)}</dd>
          </div>
        </dl>
      )}

      {status.restricted && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              {status.status === 'trial-expired'
                ? t('license.trial.expiredTitle')
                : t('license.status.restrictedTitle')}
            </p>
            <p className="text-sm">
              {status.status === 'trial-expired'
                ? t('license.trial.expiredBody')
                : t('license.status.restrictedBody')}
            </p>
          </div>
        </div>
      )}

      {status.status === 'trial-active' && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('license.trial.activeBody')}
        </p>
      )}

      {status.founderDiscountExpired && (
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4 text-foreground">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{t('license.founder.expiredTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('license.founder.expiredBody')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
