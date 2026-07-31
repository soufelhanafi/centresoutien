import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useHolidays } from '../../hooks/holiday/use-holidays';
import { holidayYearOptions, type HolidayYearFilter } from '../../lib/holidays/holiday-years';
import { HolidayListPanel } from './holiday-list-panel';
import { CreateHolidayDialog } from './create-holiday-dialog';
import { YearFilter } from './year-filter';

/**
 * Holidays management section of the Settings page: solar (fixed) and lunar
 * (manual, per year) holidays with a year filter, active/archived tabs, and
 * create / edit / archive / restore. Gated behind `settings.holidays`.
 */
export function HolidaysSettings() {
  // The whole section is plan-gated — cosmetic hiding only; the domain use cases
  // are the real gate. Gate before any data hooks so a locked plan does no work.
  if (!useFeature('settings.holidays')) return null;
  return <HolidaysSettingsContent />;
}

function HolidaysSettingsContent() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<HolidayYearFilter>(currentYear);
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = () => setCreateOpen(true);

  // The year options span both lists so switching tabs never hides a year that
  // only archived holidays use. Both queries are shared with the panels' cache.
  const active = useHolidays('active');
  const archived = useHolidays('archived');
  const years = holidayYearOptions([...(active.data ?? []), ...(archived.data ?? [])], currentYear);

  return (
    <section aria-labelledby="holidays-title" className="flex w-full flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="holidays-title" className="text-lg font-semibold text-foreground">
            {t('holidays.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('holidays.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('holidays.new')}
        </Button>
      </header>

      <Tabs defaultValue="active">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="active">{t('holidays.tabs.active')}</TabsTrigger>
            <TabsTrigger value="archived">{t('holidays.tabs.archived')}</TabsTrigger>
          </TabsList>
          <YearFilter value={year} years={years} onChange={setYear} />
        </div>
        <TabsContent value="active" className="mt-4">
          <HolidayListPanel variant="active" year={year} onCreate={openCreate} />
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          <HolidayListPanel variant="archived" year={year} onCreate={openCreate} />
        </TabsContent>
      </Tabs>

      <CreateHolidayDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
