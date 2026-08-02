import { useMemo, useState } from 'react';
import type { GroupKind } from '@centresoutien/domain';
import { useFeature } from '../use-feature';
import { useSubjects } from '../subject/use-subjects';
import { useFormulas } from '../formula/use-formulas';
import {
  partitionSubscriptions,
  type ActiveSubscriptionsByKind,
} from '../../lib/subscriptions/subscription-grouping';
import { currentMonth } from '../../lib/subscriptions/subscription-month';
import type { SubscriptionView } from '../../lib/subscriptions/subscription-view';
import { useSubscriptions } from './use-subscriptions';

/** The subscription being changed, or `null` when subscribing a track fresh. */
export type WizardTarget = { kind: GroupKind; current: SubscriptionView | null };

/**
 * Composes the queries and derived state the student subscription tab needs:
 * live subscriptions split into Active-per-kind + History, the formula/subject
 * option lists the wizard and label resolution depend on, and the
 * open/close-and-reopen wizard's target. Exam-prep is hidden entirely on plans
 * without `core.exam-prep`, mirroring `GroupKindField`.
 */
export function useSubscriptionTab(studentId: string) {
  const subscriptionsQuery = useSubscriptions(studentId);
  const formulasQuery = useFormulas('active');
  const subjectsQuery = useSubjects('all');
  const examPrepEnabled = useFeature('core.exam-prep');
  const [wizardTarget, setWizardTarget] = useState<WizardTarget | null>(null);

  const { activeByKind, history }: {
    activeByKind: ActiveSubscriptionsByKind;
    history: readonly SubscriptionView[];
  } = useMemo(
    () => partitionSubscriptions(subscriptionsQuery.data ?? [], currentMonth()),
    [subscriptionsQuery.data],
  );

  return {
    subscriptionsQuery,
    formulas: formulasQuery.data ?? [],
    subjects: subjectsQuery.data ?? [],
    activeByKind,
    history,
    examPrepEnabled,
    wizardTarget,
    openWizard: (kind: GroupKind, current: SubscriptionView | null) => setWizardTarget({ kind, current }),
    closeWizard: () => setWizardTarget(null),
  };
}
