import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { TeacherAvailabilityExceptionRepository } from '../../../src/ports/teacher-availability-exception-repository';
import type {
  TeacherAvailabilityException,
  TeacherAvailabilityExceptionId,
} from '../../../src/entities/teacher-availability-exception';
import type { TeacherId } from '../../../src/entities/teacher';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link TeacherAvailabilityExceptionRepository} for unit tests.
 * Reads exclude tombstones and order by range start then id, mirroring the
 * SQLite adapter (same convention as the center-hours-override fake).
 */
export class InMemoryTeacherAvailabilityExceptionRepository
  extends InMemorySoftDeletableRepository<TeacherAvailabilityExceptionId, TeacherAvailabilityException>
  implements TeacherAvailabilityExceptionRepository
{
  async listForTeacher(
    centerCode: CenterCode,
    teacherId: TeacherId,
  ): Promise<readonly TeacherAvailabilityException[]> {
    return this.all()
      .filter(
        (row) => row.centerCode === centerCode && row.teacherId === teacherId && row.deletedAt === null,
      )
      .sort(byStartThenId);
  }

  async listOverlapping(
    centerCode: CenterCode,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<readonly TeacherAvailabilityException[]> {
    return this.all()
      .filter(
        (row) =>
          row.centerCode === centerCode &&
          row.deletedAt === null &&
          row.dateRange.start <= rangeEnd &&
          row.dateRange.end >= rangeStart,
      )
      .sort(byStartThenId);
  }
}

function byStartThenId(a: TeacherAvailabilityException, b: TeacherAvailabilityException): number {
  if (a.dateRange.start !== b.dateRange.start) {
    return a.dateRange.start < b.dateRange.start ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
