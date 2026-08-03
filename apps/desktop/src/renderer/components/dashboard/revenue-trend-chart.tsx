import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoneyMad, formatMonthShort } from '../../lib/format';
import type { MonthlyRevenuePointView } from '../../lib/dashboard/dashboard-view';

/** Avancé widget: trailing-months collected-revenue trend (MAD), oldest first. */
export function RevenueTrendChart({ points }: { points: readonly MonthlyRevenuePointView[] }) {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  return (
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
          stroke="var(--color-primary)"
          fill="var(--color-primary)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
