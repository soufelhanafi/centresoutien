import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParentView } from '../../lib/parents/parent-view';

/** Read view of the parent's contact fields, shown at the top of the detail sheet. */
export function ParentContactInfo({ parent }: { parent: ParentView }) {
  const { t } = useTranslation();
  const none = t('parents.detail.contact.none');

  const rows: { label: string; value: ReactNode; dir?: 'ltr' }[] = [
    { label: t('parents.detail.contact.phone'), value: parent.phone, dir: 'ltr' },
    { label: t('parents.detail.contact.email'), value: parent.email ?? none, dir: 'ltr' },
    { label: t('parents.detail.contact.relation'), value: t(`guardian.relation.${parent.relation}`) },
    {
      label: t('parents.detail.contact.whatsapp'),
      value: parent.whatsappOptIn
        ? t('parents.detail.contact.whatsappYes')
        : t('parents.detail.contact.whatsappNo'),
    },
  ];

  return (
    <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {row.label}
          </dt>
          <dd dir={row.dir} className="mt-1 break-words text-start text-sm text-foreground">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
