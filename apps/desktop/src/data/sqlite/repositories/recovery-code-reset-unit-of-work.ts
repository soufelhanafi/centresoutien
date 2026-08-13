import type { Database as DB } from 'better-sqlite3';
import type { RecoveryCodeResetUnitOfWork, RecoveryCodeResetUnit } from '@centresoutien/domain';
import { ADMIN_ACCOUNT_SAVE_SQL, adminAccountToSaveParams } from './admin-account-repository';
import { RECOVERY_CODE_CONSUME_IF_UNCONSUMED_SQL } from './recovery-code-repository';
import { AUTH_AUDIT_LOG_INSERT_SQL, authAuditEventToParams } from './auth-audit-log-repository';
import { DEVICE_SESSION_CLEAR_SQL, DEVICE_SESSION_EXISTS_SQL } from './device-session-store';

// SQLite adapter for RecoveryCodeResetUnitOfWork (SOU-169). Runs the whole reset
// — password write, guarded code consume, optional device-session clear, and the
// audit rows — inside a SINGLE db.transaction, so a throw at any step rolls the
// lot back and the code is never spent on an unchanged password. It owns no SQL
// of its own: every statement is imported from the repository that owns that
// table, so there is one source of truth per write.
//
// State-dependent decisions are made INSIDE the transaction, not trusted from a
// pre-read (the same discipline as SqlitePaymentLedgerUnitOfWork): the consume is
// guarded on `consumed = 0` and the session clear + its invalidation event are
// derived from the live session row. better-sqlite3 transactions are synchronous
// and serialize on the single connection, so no concurrent writer can observe a
// half-applied reset.
export class SqliteRecoveryCodeResetUnitOfWork implements RecoveryCodeResetUnitOfWork {
  private readonly saveAccount;
  private readonly consumeCode;
  private readonly recordAudit;
  private readonly sessionExists;
  private readonly clearSession;

  constructor(private readonly db: DB) {
    this.saveAccount = db.prepare(ADMIN_ACCOUNT_SAVE_SQL);
    this.consumeCode = db.prepare(RECOVERY_CODE_CONSUME_IF_UNCONSUMED_SQL);
    this.recordAudit = db.prepare(AUTH_AUDIT_LOG_INSERT_SQL);
    this.sessionExists = db.prepare(DEVICE_SESSION_EXISTS_SQL);
    this.clearSession = db.prepare(DEVICE_SESSION_CLEAR_SQL);
  }

  async commit(unit: RecoveryCodeResetUnit): Promise<void> {
    const run = this.db.transaction((u: RecoveryCodeResetUnit): void => {
      this.saveAccount.run(adminAccountToSaveParams(u.account));

      const consumed = this.consumeCode.run({
        id: u.consumedCodeId,
        consumed_at: u.consumedAt.toISOString(),
      });
      if (consumed.changes === 0) throw u.onCodeAlreadyConsumed();

      for (const event of u.auditEvents) this.recordAudit.run(authAuditEventToParams(event));

      if (this.sessionExists.get() !== undefined) {
        this.clearSession.run();
        this.recordAudit.run(authAuditEventToParams(u.deviceSessionInvalidatedEvent));
      }
    });
    run(unit);
  }
}
