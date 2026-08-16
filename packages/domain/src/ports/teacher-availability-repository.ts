import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { CenterCode } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import type {
  TeacherAvailability,
  TeacherAvailabilityId,
} from '../entities/teacher-availability';

/**
 * Repository port for a teacher's weekly availability windows (SOU-259). One
 * live row per `(centerCode, teacherId)` is the application-level upsert
 * invariant, not a DB constraint: two devices can each create a row for the
 * same teacher before their first sync, and both rows must survive projection.
 * `findByTeacher` therefore resolves the deterministic winner — **greatest id**
 * — and `listForCenter` returns live rows in ascending id order, so a caller
 * folding them into a per-teacher map converges on that same winner. A teacher
 * with no row is unrestricted; both reads exclude tombstones like every
 * soft-deletable port.
 */
export interface TeacherAvailabilityRepository
  extends SoftDeletableRepository<TeacherAvailabilityId, TeacherAvailability> {
  findByTeacher(centerCode: CenterCode, teacherId: TeacherId): Promise<TeacherAvailability | null>;
  listForCenter(centerCode: CenterCode): Promise<readonly TeacherAvailability[]>;
}
