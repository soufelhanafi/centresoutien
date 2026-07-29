import type { WeekdayHoursInput } from '@centresoutien/domain';

/** The form's value shape: the seven-row week wrapped so RHF has an object root. */
export type CenterHoursFormValues = { week: WeekdayHoursInput[] };
