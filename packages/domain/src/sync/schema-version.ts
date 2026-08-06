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
 */
export const SCHEMA_VERSION = 1;
