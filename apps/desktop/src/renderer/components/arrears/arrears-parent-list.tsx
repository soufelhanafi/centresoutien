import { useState } from 'react';
import type { ArrearsParentGroupView } from '../../lib/arrears/arrears-view';
import { ArrearsParentGroup } from './arrears-parent-group';

/** The parent cards, each independently expandable to its overdue-invoice table. */
export function ArrearsParentList({ parents }: { parents: readonly ArrearsParentGroupView[] }) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const toggleExpanded = (key: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3 print:hidden">
      {parents.map((parent) => {
        // The domain merges every guardian-less student into a single `null`
        // group (never one per student), so this sentinel is always unique.
        const key = parent.parentId ?? '__unlinked__';
        return (
          <ArrearsParentGroup
            key={key}
            parent={parent}
            expanded={expandedIds.has(key)}
            onToggleExpand={() => toggleExpanded(key)}
          />
        );
      })}
    </div>
  );
}
