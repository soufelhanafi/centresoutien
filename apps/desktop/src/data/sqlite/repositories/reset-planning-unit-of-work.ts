import type { Database as DB } from 'better-sqlite3';
import type {
  ChangeLogWriter,
  ResetPlanningUnit,
  ResetPlanningUnitOfWork,
  Session,
  WeeklyRecurringSession,
} from '@centresoutien/domain';
import { toEntityId } from '@centresoutien/domain';

const SOFT_DELETE_SESSION_SQL = `
  UPDATE sessions
     SET deleted_at = @deleted_at, updated_at = @updated_at, updated_by = @updated_by
   WHERE id = @id
`;

const SOFT_DELETE_TEMPLATE_SQL = `
  UPDATE weekly_recurring_sessions
     SET deleted_at = @deleted_at, updated_at = @updated_at, updated_by = @updated_by
   WHERE id = @id
`;

/**
 * SQLite adapter for {@link ResetPlanningUnitOfWork} (SOU-295). Soft-deletes every
 * future concrete session AND every recurring template the use case enumerated
 * inside ONE `db.transaction`, so a throw partway through rolls the WHOLE reset
 * back — a center is never left with its sessions cleared but its templates alive
 * (which would let the generator re-materialise the cleared planning), nor the
 * reverse. Each row is tombstoned with the domain-supplied `deletedAt`/`updatedBy`
 * (Clock UTC) and its `delete` change-log row is appended in the same
 * transaction, mirroring the per-row `softDelete` on the two repositories. No hard
 * delete — these are ordinary soft-delete tombstones that still sync.
 */
export class SqliteResetPlanningUnitOfWork implements ResetPlanningUnitOfWork {
  private readonly softDeleteSession;
  private readonly softDeleteTemplate;

  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {
    this.softDeleteSession = db.prepare(SOFT_DELETE_SESSION_SQL);
    this.softDeleteTemplate = db.prepare(SOFT_DELETE_TEMPLATE_SQL);
  }

  async commit(unit: ResetPlanningUnit): Promise<void> {
    const run = this.db.transaction((u: ResetPlanningUnit): void => {
      const iso = u.deletedAt.toISOString();
      for (const session of u.sessions) this.clearSession(session, iso, u);
      for (const template of u.templates) this.clearTemplate(template, iso, u);
    });
    run(unit);
  }

  private clearSession(session: Session, iso: string, unit: ResetPlanningUnit): void {
    this.softDeleteSession.run({
      id: session.id,
      deleted_at: iso,
      updated_at: iso,
      updated_by: unit.updatedBy,
    });
    this.changeLog.record({
      entityType: 'sessions',
      entityId: toEntityId(session.id),
      centerCode: session.centerCode,
      intent: 'delete',
      entity: { ...session, deletedAt: unit.deletedAt, updatedAt: unit.deletedAt, updatedBy: unit.updatedBy },
    });
  }

  private clearTemplate(template: WeeklyRecurringSession, iso: string, unit: ResetPlanningUnit): void {
    this.softDeleteTemplate.run({
      id: template.id,
      deleted_at: iso,
      updated_at: iso,
      updated_by: unit.updatedBy,
    });
    this.changeLog.record({
      entityType: 'weekly_recurring_sessions',
      entityId: toEntityId(template.id),
      centerCode: template.centerCode,
      intent: 'delete',
      entity: { ...template, deletedAt: unit.deletedAt, updatedAt: unit.deletedAt, updatedBy: unit.updatedBy },
    });
  }
}
