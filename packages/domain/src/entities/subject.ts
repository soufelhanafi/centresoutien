import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for subjects: `sub_01HW…`. */
export const SUBJECT_ID_PREFIX = 'sub';

export type SubjectId = Brand<string, 'SubjectId'>;

/**
 * A subject the center offers (Math, Physique…), configured per center under the
 * every-plan `core.subjects` feature. Soft-delete only; a subject referenced by
 * any Formula, Group, or Session cannot be deleted — the `ArchiveSubject` guard
 * raises `SubjectInUseError`. Not people-like, so it carries no `naturalKey`.
 */
export type Subject = EntityEnvelope & {
  readonly id: SubjectId;
  name: { fr: string; ar: string };
  /**
   * Optional short code (e.g. `MATH`, `PC`). Uppercased and, when present, unique
   * per center among live (non-tombstoned) subjects — enforced by `CreateSubject`
   * (`DuplicateSubjectCodeError`) and a partial unique index. `null` means the
   * center assigned no code.
   */
  code: string | null;
  active: boolean;
};
