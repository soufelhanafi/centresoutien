import type { StudentInput } from '@centresoutien/domain';
import type { StudentView } from './student-view';

/**
 * Projects a {@link StudentView} back into the editable {@link StudentInput} the
 * `student.update` channel expects. Used by guardian linking, where only
 * `guardianIds` changes but the domain update replays the whole input: the
 * caller spreads the result and overrides `guardianIds`. The sync envelope and
 * `naturalKey` are intentionally absent — the use case owns those.
 */
export function studentViewToInput(student: StudentView): StudentInput {
  return {
    name: student.name,
    birthDate: student.birthDate,
    level: student.level,
    school: student.school,
    notes: student.notes,
    guardianIds: [...student.guardianIds],
  };
}
