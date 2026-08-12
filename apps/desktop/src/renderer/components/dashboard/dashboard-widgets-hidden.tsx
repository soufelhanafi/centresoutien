import { useTranslation } from 'react-i18next';

/** Shown in a dashboard panel when the admin hid every one of its widgets (SOU-231). */
export function DashboardWidgetsHidden() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border p-10 text-center">
      <p className="text-sm font-medium text-foreground">{t('dashboard.widgets.allHidden')}</p>
      <p className="text-xs text-muted-foreground">{t('dashboard.widgets.allHiddenHint')}</p>
    </div>
  );
}
