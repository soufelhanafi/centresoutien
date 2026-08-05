import type { Database as DB } from 'better-sqlite3';
import type { DeviceId } from '@centresoutien/domain';
import { SqliteChangeLogWriter } from '../../../src/data/sqlite/change-log/sqlite-change-log-writer';

const TEST_DEVICE = 'dev_00000000000000000000000009' as DeviceId;

/** A change-log writer for repository integration tests — fixed clock + device. */
export function changeLogWriterForTest(
  db: DB,
  now: Date = new Date('2026-07-29T10:00:00Z'),
): SqliteChangeLogWriter {
  return new SqliteChangeLogWriter(db, { now: () => now }, TEST_DEVICE);
}
