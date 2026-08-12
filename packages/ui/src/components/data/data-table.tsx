import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cn } from '@ui/lib/utils';

export type DataTableProps = {
  /** CSS track sizes per column, e.g. `['1.3fr', '1.3fr', '120px']` (design 1a). */
  columns: readonly string[];
  children: ReactNode;
  className?: string;
};

/** Elements that must sit directly under `<table>` — never inside a section. */
const TABLE_SECTIONS = new Set(['thead', 'tbody', 'tfoot', 'caption', 'colgroup']);

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
 * into `<tbody>` automatically. Bare rows mixed with caller-provided sections
 * are gathered into a generated `<tbody>` so the output is always valid.
 */
export function DataTable({ columns, children, className }: DataTableProps) {
  const flat = flattenChildren(children);
  const callerSectioned = flat.some(isTableSection);

  let thead: ReactNode = null;
  let tbody: ReactNode = null;
  if (!callerSectioned) {
    const rows = flat;
    const firstBodyRow = rows.findIndex((row) => !isHeaderRow(row));
    const headerCount = firstBodyRow === -1 ? rows.length : firstBodyRow;
    thead = headerCount > 0 ? <thead>{rows.slice(0, headerCount)}</thead> : null;
    tbody = <tbody>{rows.slice(headerCount)}</tbody>;
  } else {
    const output: ReactNode[] = [];
    const pending: ReactElement[] = [];
    const flushPending = () => {
      if (pending.length === 0) return;
      const pendingRows = pending.slice();
      pending.length = 0;
      output.push(
        <Fragment key={`data-table-body-${output.length}`}>
          <tbody>{pendingRows}</tbody>
        </Fragment>,
      );
    };
    flat.forEach((child) => {
      if (isTableSection(child)) {
        flushPending();
        output.push(<Fragment key={`data-table-child-${output.length}`}>{child}</Fragment>);
      } else {
        pending.push(child);
      }
    });
    flushPending();
    tbody = output;
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

/** Fragment children are emitted in place, so expand them before classifying. */
function flattenChildren(node: ReactNode): ReactElement[] {
  const flat: ReactElement[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      flat.push(...flattenChildren((child.props as { children?: ReactNode }).children));
    } else {
      flat.push(child);
    }
  });
  return flat;
}

function isTableSection(node: ReactElement): boolean {
  return typeof node.type === 'string' && TABLE_SECTIONS.has(node.type);
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
