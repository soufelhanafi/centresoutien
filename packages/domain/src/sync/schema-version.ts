/**
 * The schema version of this domain's entity shapes (SOU-80). It is what a
 * device sends on every push and what the hub compares against itself before
 * accepting: if the device is older, the push is rejected with
 * `SchemaTooOldError` ("mise à jour requise") because the device could not
 * round-trip entity shapes another device already wrote.
 *
 * Bump this number (and register the matching upcasters in
 * `change-log-payload.ts`) whenever a domain entity shape evolves — it is the
 * handshake that keeps devices and hub honest about what each understands.
 * Pull remains safe across a bump: additive-only migrations mean an older
 * device simply ignores fields it does not know.
 *
 * v2 (SOU-199): `center_hours_overrides` becomes a synced entity type. Its shape
 * did NOT change (so `CURRENT_CHANGE_LOG_PAYLOAD_VERSION` stays 1 and there is no
 * payload upcaster — an identity upcaster would be a smell), but a pre-SOU-199
 * app has no registered `center_hours_overrides` mapper: on pull it would store
 * the change in its sync shadow, silently NOT project it to the real table
 * (`projectToEntityTable` returns early with no mapper), and advance its cursor
 * past it — permanent invisible loss of every synced override. Bumping forces the
 * handshake to reject that old app loudly ("mise à jour requise"): a v1 device
 * pulling from a v2 hub sees `batch.schemaVersion (2) > SCHEMA_VERSION (1)` and
 * throws `SchemaTooOldError`; a v1 device pushing to a v2 hub is rejected by the
 * hub's `input.schemaVersion (1) < SCHEMA_VERSION (2)` guard. This is the
 * schema-handshake path, NOT the local `DatabaseSchemaAheadOfAppError` migration
 * guard — no migration is added here (the table already exists since 0040), so
 * that guard never fires for this change.
 */
export const SCHEMA_VERSION = 2;
