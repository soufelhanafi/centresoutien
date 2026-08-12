import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cn } from '@ui/lib/utils';

export type DataTableProps = {
  /** CSS track sizes per column, e.g. `['1.3fr', '1.3fr', '120px']` (design 1a). */
  columns: readonly string[];
  children: ReactNode;
  className?: string;
};

/**
 * The design draws tables as CSS grid. We keep the identical geometry via
 * `<colgroup>` on a real `<table>`: grid divs would strip row/column
 * association from screen readers, against the WCAG 2.1 AA target
 * (CLAUDE.md §9). Appearance is unchanged; only the markup differs.
 *
 * Valid HTML requires rows inside `<thead>`/`<tbody>` — a bare `<tr>` under
 * `<table>` triggers a React DOM-nesting warning and browser auto-repair.
 * Callers may wrap rows themselves; otherwise the leading header rows (rows
 * containing `DataTableHead` cells) are sectioned into `<thead>` and the rest
 * into `<tbody>` automatically.
 */
export function DataTable({ columns, children, className }: DataTableProps) {
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement[];
  const callerSections = rows.some((row) => row.type === 'thead' || row.type === 'tbody');

  let thead: ReactNode = null;
  let tbody: ReactNode = children;
  if (!callerSections) {
    const firstBodyRow = rows.findIndex((row) => !isHeaderRow(row));
    const headerCount = firstBodyRow === -1 ? rows.length : firstBodyRow;
    thead = headerCount > 0 ? <thead>{rows.slice(0, headerCount)}</thead> : null;
    tbody = <tbody>{rows.slice(headerCount)}</tbody>;
  }

  return (
    <table className={cn('w-full table-fixed border-collapse text-sm', className)}>
      <colgroup>
        {columns.map((width, index) => (
          <col key={`${width}-${index}`} style={{ width }} />
        ))}
      </colgroup>
      {thead}
      {tbody}
    </table>
  );
}

function isHeaderRow(node: ReactElement): boolean {
  if (node.type !== DataTableRow) return false;
  return Children.toArray((node.props as { children?: ReactNode }).children).some(
    (child) => isValidElement(child) && child.type === DataTableHead,
  );
}

export function DataTableRow({ className, children }: { className?: string; children: ReactNode }) {
  return <tr className={cn('border-b border-border last:border-b-0', className)}>{children}</tr>;
}

export function DataTableHead({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 text-start text-[11px] font-bold uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function DataTableCell({ className, children }: { className?: string; children: ReactNode }) {
  return <td className={cn('px-4 py-3 text-start align-middle', className)}>{children}</td>;
}
