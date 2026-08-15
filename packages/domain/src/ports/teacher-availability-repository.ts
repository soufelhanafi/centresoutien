import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { CenterCode } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import type {
  TeacherAvailability,
  TeacherAvailabilityId,
} from '../entities/teacher-availability';

/**
 * Repository port for a teacher's weekly availability windows (SOU-259). At
 * most one live row per `(centerCode, teacherId)` — `findByTeacher` is the
 * upsert lookup; `listForCenter` feeds the session generator, which needs every
 * configured teacher's windows in one read. A teacher with no row is
 * unrestricted, so both reads exclude tombstones like every soft-deletable port.
 */
export interface TeacherAvailabilityRepository
  extends SoftDeletableRepository<TeacherAvailabilityId, TeacherAvailability> {
  findByTeacher(centerCode: CenterCode, teacherId: TeacherId): Promise<TeacherAvailability | null>;
  listForCenter(centerCode: CenterCode): Promise<readonly TeacherAvailability[]>;
}
