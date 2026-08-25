import type { Database as DB } from 'better-sqlite3';
import type {
  ChangeLogWriter,
  EmailPasswordResetUnitOfWork,
  EmailPasswordResetUnit,
} from '@centresoutien/domain';
import { saveUserCredentialAndMaybeReplicate } from './admin-account-repository';
import { AUTH_AUDIT_LOG_INSERT_SQL, authAuditEventToParams } from './auth-audit-log-repository';
import { DEVICE_SESSION_CLEAR_SQL, DEVICE_SESSION_EXISTS_SQL } from './device-session-store';

// SQLite adapter for EmailPasswordResetUnitOfWork (SOU-273). The email path's
// counterpart to SqliteRecoveryCodeResetUnitOfWork: the whole reset — password
// write, optional device-session clear, and the audit rows — runs inside a SINGLE
// db.transaction, so a throw at any step rolls the lot back and the password is
// never left changed while its log or session-clear is lost. There is NO code to
// consume here: the mailbox proof is verified by the relay in the main process
// before this seam runs.
//
// Like the recovery adapter it owns no SQL of its own — every statement is
// imported from the repository that owns that table, keeping one write path per
// table. The owner credential write goes through saveOwnerCredentialAndMaybeReplicate
// with the DOMAIN-decided `u.replicate` flag (SOU-258): a sync-participating
// owner's reset appends a `users` change_log row in the SAME transaction; a
// migrated owner stays device-local. The session clear + its invalidation event
// are derived from the live session row INSIDE the transaction, never a pre-read.
export class SqliteEmailPasswordResetUnitOfWork implements EmailPasswordResetUnitOfWork {
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

  async commit(unit: EmailPasswordResetUnit): Promise<void> {
    const run = this.db.transaction((u: EmailPasswordResetUnit): void => {
      saveUserCredentialAndMaybeReplicate(this.db, this.changeLog, u.credential, u.replicate);

      for (const event of u.auditEvents) this.recordAudit.run(authAuditEventToParams(event));

      if (this.sessionExists.get() !== undefined) {
        this.clearSession.run();
        this.recordAudit.run(authAuditEventToParams(u.deviceSessionInvalidatedEvent));
      }
    });
    run(unit);
  }
}
