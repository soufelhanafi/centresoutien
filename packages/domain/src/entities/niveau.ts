import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for niveaux: `niv_01HW…`. */
export const NIVEAU_ID_PREFIX = 'niv';

export type NiveauId = Brand<string, 'NiveauId'>;

/** The three Moroccan school-level bands a center's levels split into. */
export const NIVEAU_CATEGORIES = ['primaire', 'college', 'lycee'] as const;
export type NiveauCategory = (typeof NIVEAU_CATEGORIES)[number];

/**
 * A grade level the center teaches (1AP, 1AC, 2ème Bac SVT…), configured per
 * center under the every-plan `core.niveaux` feature. Soft-delete only; a
 * niveau referenced by any live Student, Group, or Teacher cannot be archived —
 * the `ArchiveNiveau` guard raises `NiveauInUseError`. Not people-like, so it
 * carries no `naturalKey`. `active` is the enable/archive toggle (deactivation
 * keeps history queryable, like `Subject.active`); the soft-delete tombstone
 * (`deletedAt`) is reserved for full removal from the pickers.
 */
export type Niveau = EntityEnvelope & {
  readonly id: NiveauId;
  name: { fr: string; ar: string };
  /**
   * Optional short code (e.g. `1AP`, `2BAC-SVT`). Uppercased and, when present,
   * unique per center among live (non-tombstoned) niveaux — enforced by
   * `CreateNiveau` / `UpdateNiveau` (`DuplicateNiveauCodeError`) and a partial
   * unique index. Unlike `Subject.code`, it IS editable (SOU-260). `null` means
   * the center assigned no code.
   */
  code: string | null;
  category: NiveauCategory;
  active: boolean;
};
