import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { CenterCode } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import type {
  TeacherAvailabilityException,
  TeacherAvailabilityExceptionId,
} from '../entities/teacher-availability-exception';

/**
 * Repository port for one-off teacher absences (SOU-259). `listForTeacher`
 * backs the Teacher screen's exception list (ordered by range start, then id,
 * so devices render identically); `listOverlapping` backs the session
 * generator, which only cares about absences intersecting the run's
 * materialization span — bounds are inclusive `YYYY-MM-DD` civil dates.
 */
export interface TeacherAvailabilityExceptionRepository
  extends SoftDeletableRepository<TeacherAvailabilityExceptionId, TeacherAvailabilityException> {
  listForTeacher(
    centerCode: CenterCode,
    teacherId: TeacherId,
  ): Promise<readonly TeacherAvailabilityException[]>;
  listOverlapping(
    centerCode: CenterCode,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<readonly TeacherAvailabilityException[]>;
}
