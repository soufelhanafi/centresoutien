import type { Database as DB } from 'better-sqlite3';
import type {
  CenterCode,
  ChangeLogWriter,
  SetupCodeRecoveryUnit,
  SetupCodeRecoveryUnitOfWork,
} from '@centresoutien/domain';
import { toEntityId } from '@centresoutien/domain';
import { userRowToUser, type UserRow } from './user-repository';
import { AUTH_AUDIT_LOG_INSERT_SQL, authAuditEventToParams } from './auth-audit-log-repository';
import { DEVICE_SESSION_CLEAR_SQL, DEVICE_SESSION_EXISTS_SQL } from './device-session-store';

// SQLite adapter for SetupCodeRecoveryUnitOfWork (SOU-303). The counterpart to the
// email / recovery-code reset units for the director-reissued-code path: the whole
// recovery — password rotation via the setup-code compare-and-set, optional
// `users` change_log append, the audit rows, and an optional device-session clear —
// runs inside a SINGLE db.transaction, so a throw at any step rolls the lot back and
// the password is never left changed while its log or session-clear is lost. The
// CAS guards on the pending hash so a redemption racing between verification and
// this commit cannot double-apply; a zero-row update raises `onCodeAlreadyRedeemed`.
export class SqliteSetupCodeRecoveryUnitOfWork implements SetupCodeRecoveryUnitOfWork {
  private readonly recordAudit;
  private readonly sessionExists;
  private readonly clearSession;

  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {
    this.recordAudit = db.prepare(AUTH_AUDIT_LOG_INSERT_SQL);
    this.sessionExists = db.prepare(DEVICE_SESSION_EXISTS_SQL);
    this.clearSession = db.prepare(DEVICE_SESSION_CLEAR_SQL);
  }

  async commit(unit: SetupCodeRecoveryUnit): Promise<void> {
    const iso = unit.redeemedAt.toISOString();
    const run = this.db.transaction((u: SetupCodeRecoveryUnit): void => {
      const info = this.db
        .prepare(
          `UPDATE users
              SET password_hash          = @password_hash,
                  setup_code_hash        = NULL,
                  setup_code_expires_at  = NULL,
                  setup_code_redeemed_at = @redeemed_at,
                  updated_at             = @redeemed_at,
                  updated_by             = @updated_by
            WHERE id = @id
              AND setup_code_hash = @expected_setup_code_hash
              AND setup_code_redeemed_at IS NULL
              AND deleted_at IS NULL`,
        )
        .run({
          id: u.id,
          expected_setup_code_hash: u.expectedSetupCodeHash,
          password_hash: u.passwordHash,
          redeemed_at: iso,
          updated_by: u.updatedBy,
        });
      if (info.changes === 0) throw u.onCodeAlreadyRedeemed();

      if (u.replicate) {
        const row = this.db
          .prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL')
          .get(u.id) as UserRow | undefined;
        if (row) {
          this.changeLog.record({
            entityType: 'users',
            entityId: toEntityId(u.id),
            centerCode: row.center_code as CenterCode,
            intent: 'upsert',
            entity: userRowToUser(row),
          });
        }
      }

      for (const event of u.auditEvents) this.recordAudit.run(authAuditEventToParams(event));

      if (this.sessionExists.get() !== undefined) {
        this.clearSession.run();
        this.recordAudit.run(authAuditEventToParams(u.deviceSessionInvalidatedEvent));
      }
    });
    run(unit);
  }
}
