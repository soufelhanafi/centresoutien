import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@centresoutien/ui';
import { useEnrollableStudents } from '../../hooks/group/use-enrollable-students';
import { useAddStudent } from '../../hooks/group/use-add-student';
import { localizedName } from '../../lib/groups/localized-name';
import { enrollmentErrorCode } from '../../lib/groups/enrollment-error';

/** The current calendar month, `YYYY-MM` — the default enrollment start. */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Quick add-student modal: pick an un-enrolled student and a start month, then
 * enroll. The candidate list excludes students already in the group. Maps to
 * `enrollment.create` under the real adapter.
 */
export function AddStudentDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const candidates = useEnrollableStudents(groupId, open);
  const add = useAddStudent();
  const [studentId, setStudentId] = useState('');
  const [startMonth, setStartMonth] = useState(currentMonth);

  // Reset the picker every time the modal reopens.
  useEffect(() => {
    if (open) {
      setStudentId('');
      setStartMonth(currentMonth());
    }
  }, [open]);

  const students = candidates.data ?? [];
  const canSubmit = studentId !== '' && startMonth !== '' && !add.isPending;

  const handleConfirm = async () => {
    try {
      await add.mutateAsync({ groupId, studentId, startMonth });
      toast.success(t('groups.roster.addSuccess'));
      onOpenChange(false);
    } catch (error) {
      // Surface each domain guard (full / duplicate / cross-kind / no
      // subscription) with its own message; fall back to the generic one for a
      // validation or transport failure. The modal stays open so the user can fix
      // the pick.
      const code = enrollmentErrorCode(error);
      toast.error(code ? t(`errors.${code}`) : t('groups.roster.addError'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('groups.roster.addCancel')}>
        <DialogHeader>
          <DialogTitle>{t('groups.roster.addTitle')}</DialogTitle>
          <DialogDescription>{t('groups.roster.addDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>{t('groups.roster.studentLabel')}</Label>
            <Select value={studentId} onValueChange={setStudentId} disabled={students.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={t('groups.roster.studentPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {`${localizedName(student.name, i18n.language)} — ${student.level}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {students.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('groups.roster.noCandidates')}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-student-month">{t('groups.roster.month')}</Label>
            <Input
              id="add-student-month"
              type="month"
              dir="ltr"
              value={startMonth}
              onChange={(event) => setStartMonth(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('groups.roster.addCancel')}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleConfirm}>
            {t('groups.roster.addConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
