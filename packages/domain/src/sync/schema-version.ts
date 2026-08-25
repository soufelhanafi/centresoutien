/*
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
 *
 * v3 (SOU-259): `teacher_availability` and `teacher_availability_exceptions`
 * become synced entity types — the same failure mode as v2: the shapes are new
 * (payload version stays 1, no upcaster), but a pre-SOU-259 app has neither the
 * tables (migration 0045) nor the registered mappers, so on pull it would
 * shadow-store the changes, project nothing, and silently advance its cursor —
 * permanent invisible loss of every synced availability row. The bump makes the
 * handshake reject that old app loudly ("mise à jour requise") on both sides.
 *
 * v4 (SOU-157): `users` gains a nullable `email` field. Unlike v2/v3 this is a
 * new FIELD on an already-synced entity, but the loss mode is the same: a
 * pre-SOU-157 app has the `users` mapper yet no `email` column (migration 0048),
 * so on pull its old mapper drops the field and advances its cursor past the
 * change. After that device later upgrades, migration 0048 initializes the
 * column to NULL and the already-consumed feed entry is never replayed —
 * permanently losing the synced address on that device. The bump forces the
 * handshake to reject the old app ("mise à jour requise") so it can only pull
 * the email-bearing change AFTER it has the column and mapper to keep it. No
 * payload upcaster: a payload authored before the field simply projects the
 * missing key as NULL (mapper `?? null`), so `CURRENT_CHANGE_LOG_PAYLOAD_VERSION`
 * stays put.
 *
 * v5 (SOU-258 follow-up): `users` relaxes its per-center live-username
 * uniqueness from a HARD unique index (`ux_users_username_live`, 0044) to a
 * non-unique lookup index (migration 0053). The column shape is unchanged, but
 * the SYNC BEHAVIOUR is not: a new device lets two same-username rows coexist
 * (two laptops that each created the owner offline) and converges them at read,
 * whereas a pre-0053 device still carrying the unique index would throw
 * `UNIQUE constraint failed` and abort the ENTIRE sync-apply batch the moment it
 * pulled the peer's owner row. The bump forces the handshake to reject that old
 * app loudly ("mise à jour requise") — a v4 device pulling from a v5 hub sees
 * `batch.schemaVersion (5) > SCHEMA_VERSION (4)` and throws `SchemaTooOldError`;
 * a v4 push to a v5 hub is rejected by the hub's `schemaVersion < 5` guard —
 * so an un-upgraded laptop can never wedge on the relaxed data. No payload
 * upcaster: the entity shape did not change (`CURRENT_CHANGE_LOG_PAYLOAD_VERSION`
 * stays put); this is purely the index/constraint relaxation.
 */
export const SCHEMA_VERSION = 5;
