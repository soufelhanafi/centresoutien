import { useTranslation } from 'react-i18next';
import { ReceiptText } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { useSubscriptionTab } from '../../hooks/subscription/use-subscription-tab';
import { SubscriptionActiveCard } from './subscription-active-card';
import { SubscriptionHistoryTable } from './subscription-history-table';
import { ChangeSubscriptionDialog } from './change-subscription-dialog';

/**
 * Student → subscription panel (SOU-65): Active slot per track + History, and
 * the "change formula" close-and-reopen wizard. Exam-prep's slot is hidden
 * entirely without `core.exam-prep`, matching `GroupKindField`.
 */
export function SubscriptionTab({ student }: { student: StudentView }) {
  const { t } = useTranslation();
  const {
    subscriptionsQuery,
    formulas,
    subjects,
    activeByKind,
    history,
    examPrepEnabled,
    wizardTarget,
    openWizard,
    closeWizard,
  } = useSubscriptionTab(student.id);

  if (subscriptionsQuery.isPending) {
    return (
      <div className="mt-4 space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (subscriptionsQuery.isError) {
    return (
      <ErrorState
        className="mt-4"
        icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
        title={t('students.subscription.loadError')}
      />
    );
  }

  return (
    <section className="mt-4 flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <SubscriptionActiveCard
          kind="regular"
          subscription={activeByKind.regular}
          formulas={formulas}
          subjects={subjects}
          onManage={() => openWizard('regular', activeByKind.regular)}
        />
        {examPrepEnabled && (
          <SubscriptionActiveCard
            kind="exam-prep"
            subscription={activeByKind['exam-prep']}
            formulas={formulas}
            subjects={subjects}
            onManage={() => openWizard('exam-prep', activeByKind['exam-prep'])}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('students.subscription.history.heading')}</h3>
        {history.length === 0 ? (
          <EmptyState
            icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
            title={t('students.subscription.history.empty')}
          />
        ) : (
          <SubscriptionHistoryTable history={history} formulas={formulas} subjects={subjects} />
        )}
      </div>

      <ChangeSubscriptionDialog
        studentId={student.id}
        target={wizardTarget}
        formulas={formulas}
        subjects={subjects}
        onClose={closeWizard}
      />
    </section>
  );
}
