const TABLE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/**
 * Guards every SQL identifier the change-log machinery interpolates textually
 * because SQLite cannot bind it: the `entity_type` table name during replay
 * and each snapshot column name taken from the mapped payload. These are
 * trusted today (repo constants, a local row mapped by the registered entity
 * mapper) — this is defense-in-depth so a stray or, later, another device's
 * payload can never turn an identifier into an injection vector once the log
 * feeds sync-apply.
 */
export function assertSqlIdentifier(identifier: string): string {
  if (!TABLE_IDENTIFIER.test(identifier)) {
    throw new Error(`change_log: unsafe SQL identifier "${identifier}"`);
  }
  return identifier;
}
