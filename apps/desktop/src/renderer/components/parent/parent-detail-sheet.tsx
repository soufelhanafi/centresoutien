import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, SquarePen } from 'lucide-react';
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@centresoutien/ui';
import type { ParentView } from '../../lib/parents/parent-view';
import { parentKeys } from '../../hooks/parent/keys';
import { CreateStudentSheet } from '../student/create-student-sheet';
import { ParentContactInfo } from './parent-contact-info';
import { ParentChildrenList } from './parent-children-list';
import { EditParentSheet } from './edit-parent-sheet';
import { ArchiveParentDialog } from './archive-parent-dialog';

/** Guardian detail drawer: contact info, linked children, and quick add-student. */
export function ParentDetailSheet({
  parent,
  open,
  onOpenChange,
  onArchived,
}: {
  parent: ParentView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [addChildOpen, setAddChildOpen] = useState(false);

  const refreshChildren = () =>
    queryClient.invalidateQueries({ queryKey: parentKeys.children(parent.id) });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" closeLabel={t('parents.form.cancel')} className="flex flex-col">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{parent.name}</SheetTitle>
            {parent.archived && (
              <Badge variant="neutral">{t('parents.detail.archivedBadge')}</Badge>
            )}
          </div>
          <SheetDescription>{t(`guardian.relation.${parent.relation}`)}</SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('parents.detail.edit')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('parents.row.archive')}
          </Button>
        </div>

        <div className="-mx-1 flex-1 space-y-6 overflow-y-auto px-1 py-2">
          <ParentContactInfo parent={parent} />
          <ParentChildrenList
            parentId={parent.id}
            enabled={open}
            onAddChild={() => setAddChildOpen(true)}
          />
        </div>
      </SheetContent>

      <EditParentSheet parent={parent} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveParentDialog
        parent={parent}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onArchived={onArchived}
      />
      <CreateStudentSheet
        open={addChildOpen}
        onOpenChange={setAddChildOpen}
        defaultGuardianIds={[parent.id]}
        onCreated={refreshChildren}
      />
    </Sheet>
  );
}
