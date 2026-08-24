import type { Database as DB } from 'better-sqlite3';
import type { DeviceId, IdGenerator } from '@centresoutien/domain';

/**
 * Read the database file's stable device-origin id, generating and persisting it
 * on first use. Every `centre-*.db` carries its OWN origin in `app_meta` — the
 * same laptop is a distinct device per center file, which keeps each center's
 * sync scope self-contained (CLAUDE.md §5ter). Shared by the composition root
 * (the live center) and the add-a-center provisioning path (SOU-310), so a freshly
 * created center gets its origin the same way an existing one does.
 */
export function readOrCreateDeviceOrigin(db: DB, ids: IdGenerator): DeviceId {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = 'device_origin'").get() as
    | { value: string }
    | undefined;
  if (row) return row.value as DeviceId;
  const id = ids.next('dev');
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('device_origin', id);
  return id as DeviceId;
}
