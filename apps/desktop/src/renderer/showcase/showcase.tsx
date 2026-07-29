import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BilingualText,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  EmptyState,
  KindBadge,
  LockOverlay,
  Numeric,
  PlanBadge,
  Skeleton,
  StatusBadge,
} from '@centresoutien/ui';

/**
 * Dev-only gallery. Lint checks class names but never renders anything, so
 * this is where we actually see the components — in FR-LTR and AR-RTL, via the
 * existing language toggle (CLAUDE.md §8).
 */
export function Showcase() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6 p-8">
      <h2 className="text-xl font-semibold">{t('showcase.title')}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t('showcase.badges')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <StatusBadge status="draft" label={t('showcase.statusDraft')} />
          <StatusBadge status="paid" label={t('showcase.statusPaid')} />
          <StatusBadge status="partially-paid" label={t('showcase.statusPartial')} />
          <StatusBadge status="cancelled" label={t('showcase.statusCancelled')} />
          <KindBadge kind="regular" label={t('showcase.kindRegular')} />
          <KindBadge kind="exam-prep" label={t('showcase.kindExam')} />
          <PlanBadge tier="essentiel" />
          <PlanBadge tier="pro" />
          <PlanBadge tier="premium" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('showcase.feedback')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <EmptyState
            icon={<BookOpen className="h-5 w-5" />}
            title={t('showcase.emptyTitle')}
            description={t('showcase.emptyBody')}
            action={<Button size="sm">{t('showcase.emptyCta')}</Button>}
          />
          <LockOverlay
            title={t('showcase.lockTitle')}
            description={t('showcase.lockBody')}
            ctaLabel={t('showcase.lockCta')}
            onCta={() => undefined}
          >
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton tone="faint" className="h-3 w-2/3" />
              <Skeleton tone="faint" className="h-3 w-3/4" />
            </div>
          </LockOverlay>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('showcase.data')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={['1.3fr', '1.3fr', '1fr']}>
            <thead>
              <DataTableRow>
                <DataTableHead>Nom</DataTableHead>
                <DataTableHead>الاسم</DataTableHead>
                <DataTableHead>MAD</DataTableHead>
              </DataTableRow>
            </thead>
            <tbody>
              <DataTableRow>
                <DataTableCell>
                  <BilingualText value="Mathématiques" script="latin" />
                </DataTableCell>
                <DataTableCell>
                  <BilingualText value="الرياضيات" script="arabic" />
                </DataTableCell>
                <DataTableCell className="text-end">
                  <Numeric>350 MAD</Numeric>
                </DataTableCell>
              </DataTableRow>
            </tbody>
          </DataTable>
        </CardContent>
      </Card>
    </div>
  );
}
