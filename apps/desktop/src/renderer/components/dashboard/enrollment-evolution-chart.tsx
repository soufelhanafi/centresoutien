import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonthShort } from '../../lib/format';
import type { MonthlyEnrollmentPointView } from '../../lib/dashboard/dashboard-view';

/** Avancé widget: trailing-months live-subscription headcount, oldest first. */
export function EnrollmentEvolutionChart({ points }: { points: readonly MonthlyEnrollmentPointView[] }) {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={[...points]} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
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
          labelFormatter={(label) => formatMonthShort(String(label), locale)}
          contentStyle={{
            background: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="activeStudentCount"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
