import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoneyMad, formatMonthShort } from '../../lib/format';
import type { MonthlyRevenuePointView } from '../../lib/dashboard/dashboard-view';

/**
 * Avancé widget: trailing-months collected-revenue trend (MAD), oldest first.
 * Wrapped `dir="ltr"`: Recharts never mirrors axes for RTL, and reversing only
 * the point order without also reversing the tick/tooltip layout would read
 * worse than a fixed oldest→newest, left→right timeline in both locales —
 * the same call `KpiCard` and `AttendanceRateCard` make for their figures.
 */
export function RevenueTrendChart({ points }: { points: readonly MonthlyRevenuePointView[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const seriesName = t('dashboard.advanced.widgets.revenueTrend');

  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={[...points]} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(value: string) => formatMonthShort(value, locale)}
            tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(value) => formatMoneyMad(Number(value), locale)}
            labelFormatter={(label) => formatMonthShort(String(label), locale)}
            contentStyle={{
              background: 'var(--color-popover)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="collectedMad"
            name={seriesName}
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
