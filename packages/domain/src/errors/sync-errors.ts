import { DomainError } from './plan-errors';

/**
 * Thrown when a device that is older than the hub tries to sync (SOU-80).
 * Push carries the device schema version; the hub rejects a device whose schema
 * is older than its own because it could not round-trip the entity shapes
 * another device already wrote. Additive-only migrations keep *pull* safe (the
 * device ignores unknown fields), so a too-old device can still read — it just
 * cannot write until it updates. The renderer maps the stable `schema-too-old`
 * code to "mise à jour requise".
 */
export class SchemaTooOldError extends DomainError {
  readonly code = 'schema-too-old';

  constructor(
    readonly deviceSchema: number,
    readonly requiredSchema: number,
  ) {
    super(
      `App schema v${deviceSchema} is older than the hub's v${requiredSchema}. Update required.`,
    );
  }
}

/**
 * Thrown when the hub reports a push `accepted` but omits the assigned version
 * for an entity that was pushed — a contract violation, not a retryable race.
 * Silently skipping it would leave the write pending forever and re-pushed on
 * every cycle, so the protocol is treated as broken the moment it happens.
 * `entityKey` is a composite `{entityType}:{entityId}` (ULIDs only, no PII).
 */
export class SyncProtocolError extends DomainError {
  readonly code = 'sync-protocol';

  constructor(readonly entityKey: string) {
    super(
      `Sync protocol violation: hub accepted the push but returned no version for "${entityKey}".`,
    );
  }
}
