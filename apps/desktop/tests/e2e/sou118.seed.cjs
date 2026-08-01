/* eslint-disable */
// Seed / inspect helper for SOU-118 E2E. Run under electron-as-node so the
// better-sqlite3-multiple-ciphers native ABI matches the packaged app.
//   ELECTRON_RUN_AS_NODE=1 electron sou118.seed.cjs <dbPath> <cmd> [jsonArg]
// cmd = "inspect"  -> dump table list + weekly_recurring_sessions schema + row counts
// cmd = "sessions" -> insert weekly_recurring_sessions rows from jsonArg (array)
const path = require('node:path');
const Database = require('better-sqlite3-multiple-ciphers');

const dbPath = process.argv[2];
const cmd = process.argv[3];
const jsonArg = process.argv[4] ? JSON.parse(process.argv[4]) : null;
const KEY = process.env.CS_DB_KEY || 'dev-insecure-key';

const db = new Database(dbPath);
db.pragma(`key='${KEY}'`);

function inspect() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  const out = { tables };
  if (tables.includes('weekly_recurring_sessions')) {
    out.wrsSchema = db.prepare('PRAGMA table_info(weekly_recurring_sessions)').all();
  }
  for (const t of ['subjects', 'rooms', 'teachers', 'groups', 'weekly_recurring_sessions']) {
    if (tables.includes(t)) out[`count_${t}`] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  }
  console.log(JSON.stringify(out, null, 2));
}

function insertSessions() {
  // jsonArg: array of { id, roomId, teacherId, groupId, dayOfWeek, start, end }
  const info = db.prepare('PRAGMA table_info(weekly_recurring_sessions)').all().map((c) => c.name);
  console.log('WRS_COLS ' + JSON.stringify(info));
  const now = new Date('2026-07-29T10:00:00Z').toISOString();
  const center = process.env.CS_CENTER_CODE || 'CS-DEV-001';
  const dev = 'dev_00000000000000000000000001';
  const user = 'usr_00000000000000000000000001';
  const stmt = db.prepare(
    `INSERT INTO weekly_recurring_sessions
      (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
       room_id, teacher_id, group_id, day_of_week, start_time, end_time)
     VALUES (@id, @center, @dev, @now, @now, @user, NULL, 0,
       @roomId, @teacherId, @groupId, @dayOfWeek, @start, @end)`,
  );
  const tx = db.transaction((rows) => {
    for (const r of rows) stmt.run({ ...r, center, dev, user, now });
  });
  tx(jsonArg);
  console.log('INSERTED ' + jsonArg.length);
}

if (cmd === 'inspect') inspect();
else if (cmd === 'sessions') insertSessions();
else throw new Error('unknown cmd ' + cmd);
db.close();
