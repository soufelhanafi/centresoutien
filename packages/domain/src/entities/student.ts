import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for students: `stu_01HW…`. */
export const STUDENT_ID_PREFIX = 'stu';

export type StudentId = Brand<string, 'StudentId'>;

/**
 * Forward reference to the Parent entity (SOU-40), which does not exist yet.
 * Student is the first entity to link to guardians, so the `ParentId` brand and
 * its id prefix are declared here and published from the barrel. When SOU-40
 * creates `entities/parent.ts`, it relocates these two lines there (and re-exports
 * for compatibility) — the Student side keeps referencing `ParentId` unchanged.
 */
export const PARENT_ID_PREFIX = 'prt';

export type ParentId = Brand<string, 'ParentId'>;

/**
 * A student enrolled at the center (every-plan `core.students`). People-like, so
 * it carries a `naturalKey` — a *matching* key for the parents-first duplicate
 * engine (SOU-92), never a hard business constraint. Soft-delete only.
 *
 * `guardianIds` is the many-to-many link to guardians (Parents). It lives on the
 * student as a single field so it syncs as one entry in the change log; SOU-40
 * builds the Parent entity and SOU-42 the bidirectional linking UI on top.
 */
export type Student = EntityEnvelope & {
  readonly id: StudentId;
  /**
   * `centerCode :: normalizedName :: birthDate`, stamped at creation and never
   * recomputed — even when the name is later edited — so sync matching stays
   * stable. Immutable by convention (there is no edit path that rewrites it).
   */
  readonly naturalKey: string;
  name: { fr: string; ar: string };
  birthDate: string; // 'YYYY-MM-DD'
  level: string; // grade label, center-defined (e.g. '2 Bac SM', '3AC')
  school: string | null; // external school the student attends; null when unknown
  notes: string | null; // free-form notes; null when none
  guardianIds: readonly ParentId[]; // links to guardians (Parents); empty until linked
};
