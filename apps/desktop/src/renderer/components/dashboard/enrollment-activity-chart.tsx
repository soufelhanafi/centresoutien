import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bcp47, formatMonthShort } from '../../lib/format';
import type { MonthlyEnrollmentActivityPointView } from '../../lib/dashboard/dashboard-view';

/**
 * Avancé widget: per trend-month subscriptions opened vs (net) closed, grouped
 * bars, oldest first. Wrapped `dir="ltr"` for the same reason as
 * {@link RevenueTrendChart}: Recharts never mirrors its axes for RTL, so the
 * timeline stays a fixed oldest→newest read in both locales rather than drawing
 * backwards in AR. Legend and tooltip labels are still translated.
 */
export function EnrollmentActivityChart({ points }: { points: readonly MonthlyEnrollmentActivityPointView[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const countFormatter = new Intl.NumberFormat(bcp47(locale));
  const openedLabel = t('dashboard.advanced.widgets.enrollmentActivity.opened');
  const closedLabel = t('dashboard.advanced.widgets.enrollmentActivity.closed');

  const hasActivity = points.some((point) => point.opened > 0 || point.closed > 0);
  if (!hasActivity) {
    return (
      <p className="flex flex-1 items-center justify-center py-8 text-xs text-muted-foreground">
        {t('dashboard.advanced.widgets.enrollmentActivity.empty')}
      </p>
    );
  }

  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={[...points]} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={2}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(value: string) => formatMonthShort(value, locale)}
            tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <YAxis hide allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--color-muted)', fillOpacity: 0.4 }}
            formatter={(value) => countFormatter.format(Number(value))}
            labelFormatter={(label) => formatMonthShort(String(label), locale)}
            contentStyle={{
              background: 'var(--color-popover)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            formatter={(value) => <span className="text-muted-foreground">{value}</span>}
          />
          <Bar dataKey="opened" name={openedLabel} fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="closed" name={closedLabel} fill="var(--color-destructive)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
