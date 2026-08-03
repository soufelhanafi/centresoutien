import type { AttendanceStatus } from '@centresoutien/domain';

export type StudentAttendanceRow = {
  readonly sessionId: string;
  readonly date: string;
  readonly groupId: string | null;
  readonly groupName: { readonly fr: string; readonly ar: string } | null;
  readonly status: AttendanceStatus;
  readonly note: string | null;
};

export type AttendanceStatusCounts = Readonly<Record<AttendanceStatus, number>>;

export type AttendanceAbsenceSummary = {
  readonly attendanceRatePercent: number;
  readonly consecutiveAbsences: number;
  readonly hasAbsenceStreak: boolean;
  readonly counts: AttendanceStatusCounts;
};

export type StudentAttendanceReport = {
  readonly studentId: string;
  readonly history: readonly StudentAttendanceRow[];
  readonly summary: AttendanceAbsenceSummary;
};

export type GroupAttendanceSheetView = {
  readonly groupId: string;
  readonly sessions: readonly { readonly sessionId: string; readonly date: string }[];
  readonly students: readonly {
    readonly studentId: string;
    readonly name: { readonly fr: string; readonly ar: string };
    readonly cells: ReadonlyArray<AttendanceStatus | null>;
  }[];
};
