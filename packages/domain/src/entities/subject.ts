import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for subjects: `sub_01HW…`. */
export const SUBJECT_ID_PREFIX = 'sub';

export type SubjectId = Brand<string, 'SubjectId'>;

/**
 * A subject the center offers (Math, Physique…), configured per center under the
 * every-plan `core.subjects` feature. Soft-delete only; a subject referenced by
 * any Formula or Group cannot be deleted — it is deactivated (`active = false`)
 * instead. Not people-like, so it carries no `naturalKey`.
 */
export type Subject = EntityEnvelope & {
  readonly id: SubjectId;
  name: { fr: string; ar: string };
  active: boolean;
};
