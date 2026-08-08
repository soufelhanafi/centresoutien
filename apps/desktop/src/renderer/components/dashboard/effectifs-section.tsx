import { useTranslation } from 'react-i18next';
import { cn } from '@centresoutien/ui';
import type { DashboardBasicSummaryView } from '../../lib/dashboard/dashboard-view';
import { bcp47 } from '../../lib/format';
import { EnrollmentBar } from './enrollment-bar';

const SECTION_LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

function Stat({ value, label, warning }: { value: string; label: string; warning?: boolean }) {
  return (
    <div>
      <p className={cn('font-mono text-xl font-semibold tabular-nums', warning ? 'text-warning' : 'text-foreground')}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** The Effectifs block (design 1b): 4 headcounts + per-group enrollment bars. */
export function EffectifsSection({
  effectifs,
}: {
  effectifs: DashboardBasicSummaryView['effectifs'];
}) {
  const { t, i18n } = useTranslation();
  const count = new Intl.NumberFormat(bcp47(i18n.language), { maximumFractionDigits: 0 });
  const average = new Intl.NumberFormat(bcp47(i18n.language), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <section
      aria-labelledby="dashboard-basic-effectifs"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 id="dashboard-basic-effectifs" className={SECTION_LABEL}>
        {t('dashboard.basic.sections.effectifs')}
      </h2>
      <div className="grid grid-cols-4 gap-2">
        <Stat value={count.format(effectifs.activeStudentCount)} label={t('dashboard.basic.effectifs.activeStudents')} />
        <Stat value={count.format(effectifs.groupCount)} label={t('dashboard.basic.effectifs.groups')} />
        <Stat value={average.format(effectifs.averageStudentsPerGroup)} label={t('dashboard.basic.effectifs.perGroup')} />
        <Stat
          value={count.format(effectifs.unenrolledStudentCount)}
          label={t('dashboard.basic.effectifs.unenrolled')}
          warning
        />
      </div>
      {effectifs.groupBars.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('dashboard.basic.effectifs.noGroups')}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {effectifs.groupBars.map((bar) => (
            <EnrollmentBar key={bar.groupId} bar={bar} />
          ))}
        </ul>
      )}
    </section>
  );
}
