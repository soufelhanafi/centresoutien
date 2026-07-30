import type { ReactNode } from 'react';
import { EmptyState } from '@centresoutien/ui';

/** Empty-state shell for tabs whose domain (enrollment, invoices, attendance) lands later. */
export function ComingSoonTab({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return <EmptyState className="mt-4" icon={icon} title={title} description={body} />;
}
