/**
 * @centresoutien/domain — the portable core.
 *
 * Zero platform dependencies: no React, no Electron, no SQLite, no Node builtins.
 * Compiled with `lib: ["ES2022"]` (no DOM) and zero workspace dependencies.
 */
export const DOMAIN_PACKAGE = '@centresoutien/domain' as const;

// Value objects
export type { Brand } from './value-objects/brand';
export type { CenterCode, DeviceId, UserId } from './value-objects/ids';
export { ULID_REGEX, isUlid, hasIdPrefix } from './value-objects/ids';

// Ports
export type { Clock } from './ports/clock';
export type { IdGenerator } from './ports/id-generator';

// Entity base + envelope
export type { EntityEnvelope, NewEnvelopeInput } from './entities/envelope';
export { ENVELOPE_FIELD_NAMES, newEnvelope, acceptHubVersion } from './entities/envelope';
export type { WriteContext, WriteResult } from './entities/write';
export { applyWrite } from './entities/write';

// Sync
export { diffChangedFields } from './sync/change-log';

// Repository ports
export type { SoftDeletableRepository } from './repositories/soft-deletable';
