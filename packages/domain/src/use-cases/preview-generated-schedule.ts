import type { GroupRepository } from '../ports/group-repository';
import type { RoomRepository } from '../ports/room-repository';
import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode, type EntityId } from '../value-objects/ids';
import { WEEKDAYS, type WeekdayIndex } from '../value-objects/weekday';
import type { Group, GroupId } from '../entities/group';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import type { TeacherAvailabilityRules } from '../policies/teacher-availability-policy';
import {
  resolveGeneratorMaterializationRange,
  type SessionGenerator,
  type SessionGeneratorConfig,
  type SessionGeneratorResult,
} from '../services/session-generator';
import { resolveWeek } from './weekly-session-scheduling';

export type PreviewGeneratedScheduleInput = {
  centerCode: CenterCode;
  config: SessionGeneratorConfig;
};

/**
 * Dry-runs the SOU-158 auto-session-generator engine for the SOU-159 config
 * popup preview: resolves `config.scope` into the concrete groups/teachers a
 * plain `SessionGenerationInput` needs (the pure {@link SessionGenerator} never
 * sees `'all'` — that resolution is this seam's job), loads the center's rooms
 * and opening hours, and reads the real, already-committed schedule so
 * {@link SessionGenerator.generate}'s conflict pass (SOU-161) can compare
 * against it. Zero persistence — the returned {@link SessionGeneratorResult} is
 * a proposal the caller may discard or hand to {@link CommitGeneratedSchedule}.
 * Gated per `config.mode` on the flag that mode is actually sold under —
 * `planning.custom-grid` (Pro) for `custom`, `planning.random-auto` (Premium)
 * for `auto` — never on `core.calendar.week`, which every plan holds and would
 * leave this paid capability free on Essentiel.
 */
export class PreviewGeneratedSchedule {
  constructor(
    private readonly groups: GroupRepository,
    private readonly rooms: RoomRepository,
    private readonly centerHours: CenterHoursRepository,
    private readonly recurrences: WeeklyRecurringSessionRepository,
    private readonly availability: TeacherAvailabilityRepository,
    private readonly availabilityExceptions: TeacherAvailabilityExceptionRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly generator: SessionGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: PreviewGeneratedScheduleInput): Promise<SessionGeneratorResult> {
    const { centerCode, config } = input;
    this.plan.require(config.mode === 'auto' ? 'planning.random-auto' : 'planning.custom-grid');

    const scopedGroups = this.resolveScopedGroups(await this.groups.listActive(centerCode), config);
    const teacherByGroup = new Map<GroupId, EntityId | null>(
      scopedGroups.map((group) => [group.id, group.teacherId]),
    );

    const roomEntities = await this.rooms.listActive(centerCode);
    const rooms = roomEntities.map((room) => room.id);
    const roomCapacities = new Map(roomEntities.map((room) => [room.id, room.capacity]));
    const groupCapacities = new Map(scopedGroups.map((group) => [group.id, group.capacity]));
    const centerHours = resolveWeek(await this.centerHours.listForCenter(centerCode));
    const existingSchedule = await this.loadExistingSchedule(centerCode, config);
    const availabilityByTeacher = await this.loadAvailability(centerCode, teacherByGroup, config);
    const rosterByGroup = await this.enrollments.listActiveStudentIdsByGroups(
      scopedGroups.map((group) => group.id),
    );

    return this.generator.generate({
      config,
      groups: scopedGroups.map((group) => group.id),
      teacherByGroup,
      rooms,
      roomCapacities,
      groupCapacities,
      centerHours,
      existingSchedule,
      availabilityByTeacher,
      rosterByGroup,
    });
  }

  /**
   * SOU-259: the declared availability of every teacher staffing a scoped group
   * — weekly windows plus one-off absences overlapping the run's widest
   * materialization span (the `occurrenceCount` range variant ends latest on
   * whichever weekday lands last, so the span is the max across all seven).
   * Skipped entirely — teachers read as unrestricted — when the plan lacks
   * `planning.teacher-availability`: the generator's warning layer is a paid
   * convenience, unlike the hard conflict checks that always run.
   */
  private async loadAvailability(
    centerCode: CenterCode,
    teacherByGroup: ReadonlyMap<GroupId, EntityId | null>,
    config: SessionGeneratorConfig,
  ): Promise<ReadonlyMap<EntityId, TeacherAvailabilityRules>> {
    const rulesByTeacher = new Map<EntityId, TeacherAvailabilityRules>();
    if (!this.plan.has('planning.teacher-availability')) return rulesByTeacher;
    const scopedTeachers = new Set(
      [...teacherByGroup.values()].filter((teacherId): teacherId is EntityId => teacherId !== null),
    );
    if (scopedTeachers.size === 0) return rulesByTeacher;

    const span = this.materializationSpan(config);
    const [weeklyRows, exceptionRows] = await Promise.all([
      this.availability.listForCenter(centerCode),
      this.availabilityExceptions.listOverlapping(centerCode, span.start, span.end),
    ]);

    for (const row of weeklyRows) {
      const teacherId = toEntityId(row.teacherId);
      if (!scopedTeachers.has(teacherId)) continue;
      rulesByTeacher.set(teacherId, { weeklyWindows: row.weeklyWindows, exceptions: [] });
    }
    for (const row of exceptionRows) {
      const teacherId = toEntityId(row.teacherId);
      if (!scopedTeachers.has(teacherId)) continue;
      const rules = rulesByTeacher.get(teacherId) ?? { weeklyWindows: null, exceptions: [] };
      rulesByTeacher.set(teacherId, {
        weeklyWindows: rules.weeklyWindows,
        exceptions: [...rules.exceptions, row.dateRange],
      });
    }
    return rulesByTeacher;
  }

  /** The widest `[start, end]` the run can materialize over, across all weekdays. */
  private materializationSpan(config: SessionGeneratorConfig): { start: string; end: string } {
    const ends = WEEKDAYS.map(
      (weekday) => resolveGeneratorMaterializationRange(config.range, weekday).end,
    );
    return { start: config.range.startDate, end: ends.reduce((a, b) => (a > b ? a : b)) };
  }

  /**
   * Groups eligible for this run: same `kind` as the config (exam-prep never
   * mixes with regular, CLAUDE.md §7), narrowed further by `scope.groups` and
   * `scope.teachers` when either names an explicit set instead of `'all'`.
   * `group.teacherId` is compared as a plain string against `scope.teachers`'
   * `TeacherId[]` — the same generic-id-bucket widening
   * `generated-schedule-conflicts.ts` already uses, pending the Teacher entity's
   * brand being threaded through `Group.teacherId`.
   */
  private resolveScopedGroups(
    groups: readonly Group[],
    config: SessionGeneratorConfig,
  ): readonly Group[] {
    const { scope } = config;
    return groups.filter((group) => {
      if (group.kind !== config.kind) return false;
      if (scope.groups !== 'all' && !scope.groups.includes(group.id)) return false;
      if (scope.teachers === 'all') return true;
      return (
        group.teacherId !== null &&
        (scope.teachers as readonly string[]).includes(group.teacherId as string)
      );
    });
  }

  /**
   * The real, already-committed schedule for every weekday the run could place
   * a block on — the config's `weekdayPool` (auto mode) or `pickedWeekdays`
   * (custom mode). Refs on a weekday the run ends up not using are harmless:
   * `SessionConflictPolicy.roomConflict` only ever compares same-weekday refs.
   */
  private async loadExistingSchedule(
    centerCode: CenterCode,
    config: SessionGeneratorConfig,
  ): Promise<readonly ScheduledSessionRef[]> {
    const weekdays: readonly WeekdayIndex[] =
      config.mode === 'auto' ? config.weekdayPool : config.pickedWeekdays;
    const refsByWeekday = await Promise.all(
      weekdays.map((weekday) => this.recurrences.listRefsForDay(centerCode, weekday)),
    );
    return refsByWeekday.flat();
  }
}
