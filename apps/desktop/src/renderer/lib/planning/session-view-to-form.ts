import type { PlannerSessionView } from './planner-view';
import type { SessionFormInput } from './session-form-schema';

// Weekday index → the Radix Select's string value, keyed by the DTO's numeric day.
const DAY_FIELD_VALUES = ['0', '1', '2', '3', '4', '5', '6'] as const;

// Maps an enriched planner read row back to the six editable form fields.
export function toFormInput(session: PlannerSessionView): SessionFormInput {
  return {
    dayOfWeek: DAY_FIELD_VALUES[session.dayOfWeek] ?? '0',
    start: session.start,
    end: session.end,
    roomId: session.roomId,
    teacherId: session.teacherId,
    groupId: session.groupId,
  };
}
