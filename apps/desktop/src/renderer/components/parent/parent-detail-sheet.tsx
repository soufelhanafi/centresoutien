import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, SquarePen } from 'lucide-react';
import {
  Badge,
  Button,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@centresoutien/ui';
import type { ParentView } from '../../lib/parents/parent-view';
import { parentKeys } from '../../hooks/parent/keys';
import { useParent } from '../../hooks/parent/use-parent';
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

  // Read the guardian live so an in-sheet edit is reflected immediately: the row
  // `parent` seeds `initialData` (instant paint), and the edit mutation's
  // invalidation of `parentKeys.all` refetches this by prefix. Falls back to the
  // snapshot if a refetch briefly resolves null (e.g. just-archived, sheet closing).
  const live = useParent(parent.id, { enabled: open, initialData: parent });
  const current = live.data ?? parent;

  const refreshChildren = () =>
    queryClient.invalidateQueries({ queryKey: parentKeys.children(parent.id) });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="end"
        closeLabel={t('parents.form.cancel')}
        className="flex flex-col"
        // Unlinking a child raises an "undo" toast; the toast is portaled
        // outside this modal sheet, so clicking it would otherwise be treated as
        // an outside interaction and dismiss the sheet. Keep the sheet open when
        // the interaction lands on a Sonner toast.
        onInteractOutside={(event) => {
          const target = event.detail.originalEvent.target as Element | null;
          if (target?.closest('[data-sonner-toaster]')) event.preventDefault();
        }}
      >
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{current.name}</SheetTitle>
            {current.archived && (
              <Badge variant="neutral">{t('parents.detail.archivedBadge')}</Badge>
            )}
          </div>
          <SheetDescription>{t(`guardian.relation.${current.relation}`)}</SheetDescription>
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

        <ScrollArea className="min-h-0 flex-1" contentClassName="-mx-1 space-y-6 px-1 py-2">
          <ParentContactInfo parent={current} />
          <ParentChildrenList
            parentId={current.id}
            enabled={open}
            onAddChild={() => setAddChildOpen(true)}
          />
        </ScrollArea>
      </SheetContent>

      <EditParentSheet parent={current} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveParentDialog
        parent={current}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onArchived={onArchived}
      />
      <CreateStudentSheet
        open={addChildOpen}
        onOpenChange={setAddChildOpen}
        defaultGuardianIds={[current.id]}
        onCreated={refreshChildren}
      />
    </Sheet>
  );
}
