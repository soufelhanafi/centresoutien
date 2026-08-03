import { useState } from 'react';
import type { ArrearsParentGroupView } from '../../lib/arrears/arrears-view';
import { ArrearsParentGroup } from './arrears-parent-group';

/** The parent cards, each independently expandable to its overdue-invoice table. */
export function ArrearsParentList({ parents }: { parents: readonly ArrearsParentGroupView[] }) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const toggleExpanded = (parentId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3 print:hidden">
      {parents.map((parent) => (
        <ArrearsParentGroup
          key={parent.parentId}
          parent={parent}
          expanded={expandedIds.has(parent.parentId)}
          onToggleExpand={() => toggleExpanded(parent.parentId)}
        />
      ))}
    </div>
  );
}
