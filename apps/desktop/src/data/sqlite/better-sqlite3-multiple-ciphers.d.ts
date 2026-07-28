// The multiple-ciphers build is a drop-in replacement for better-sqlite3 with
// the same API (plus the SQLCipher `key`/`cipher` pragmas), so we reuse its types.
declare module 'better-sqlite3-multiple-ciphers' {
  import Database from 'better-sqlite3';
  export = Database;
}
