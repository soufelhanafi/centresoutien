import { DomainError } from './plan-errors';
import type { NiveauId } from '../entities/niveau';

/**
 * Thrown when archiving (soft-deleting) a Niveau that is still referenced by at
 * least one live Student, Group, or Teacher (`niveauIds`). `ArchiveNiveau`
 * detects this via the `NiveauReferencePort` and rejects with this typed error
 * so the renderer can map the stable `niveau-in-use` code to a localized
 * `errors.*` message and steer the user to reassign or deactivate first, rather
 * than orphaning live records. Mirrors `SubjectInUseError`.
 */
export class NiveauInUseError extends DomainError {
  readonly code = 'niveau-in-use';

  constructor(readonly niveauId: NiveauId) {
    super(`Niveau "${niveauId}" cannot be archived while a student, group, or teacher references it.`);
  }
}

/**
 * Thrown when an archive targets a niveau id that has no live row in the current
 * center — unknown, already soft-deleted, or belonging to another center. The
 * renderer resolves the stable `niveau-not-found` code via `t(\`errors.${code}\`)`;
 * the domain stays i18n-agnostic. Mirrors `SubjectNotFoundError`.
 */
export class NiveauNotFoundError extends DomainError {
  readonly code = 'niveau-not-found';

  constructor(readonly niveauId: NiveauId) {
    super(`No live niveau with id "${niveauId}".`);
  }
}

/**
 * Thrown when creating or editing a Niveau whose `code` already belongs to
 * another live niveau in the same center. `CreateNiveau` / `UpdateNiveau` check
 * this via `NiveauRepository.findByCode` before persisting. Uniqueness is per
 * center and only among live rows, so a code freed by archiving can be reused.
 * The renderer resolves the stable `duplicate-niveau-code` code to a localized
 * message. Mirrors `DuplicateSubjectCodeError`.
 */
export class DuplicateNiveauCodeError extends DomainError {
  readonly code = 'duplicate-niveau-code';

  constructor(readonly niveauCode: string) {
    super(`A niveau with code "${niveauCode}" already exists in this center.`);
  }
}
