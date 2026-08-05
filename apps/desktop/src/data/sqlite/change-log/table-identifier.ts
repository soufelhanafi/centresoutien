const TABLE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/**
 * Guards the one place the change-log machinery interpolates an identifier into
 * SQL (SELECT/INSERT into `entity_type`'s table): SQLite cannot bind a table
 * name, so it must be substituted textually. `entity_type` is always a trusted
 * repository constant, never user input — this is defense-in-depth so a stray
 * value can never become an injection vector.
 */
export function assertTableIdentifier(entityType: string): string {
  if (!TABLE_IDENTIFIER.test(entityType)) {
    throw new Error(`change_log: unsafe entity_type identifier "${entityType}"`);
  }
  return entityType;
}
