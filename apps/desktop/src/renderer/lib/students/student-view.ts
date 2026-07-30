import type { StudentInput } from '@centresoutien/domain';

/**
 * Presentation projection of a `Student` as it crosses the IPC boundary — the
 * sync envelope (version, deviceOrigin, updatedBy…) is stripped and `Date`s are
 * serialized to strings, exactly like the existing `centerDto` (SOU-28). The
 * renderer never handles the raw domain entity.
 *
 * This mirrors the DTO a future `student.list` / `student.get` channel will
 * return; see `students-gateway.ts` for the full contract requested from the
 * domain side.
 */
export type StudentView = {
  readonly id: string;
  readonly name: { readonly fr: string; readonly ar: string };
  readonly birthDate: string; // 'YYYY-MM-DD'
  readonly level: string;
  readonly school: string | null;
  readonly notes: string | null;
  readonly guardianIds: readonly string[];
  /** Derived from `deletedAt != null` in the domain; the UI never sees the date. */
  readonly archived: boolean;
  readonly createdAt: string; // ISO 8601
};

/** The editable fields when creating or editing a student — the domain's own schema. */
export type { StudentInput };

/** List query parameters. `search` matches the FR/AR name or the level. */
export type StudentListFilter = {
  readonly search: string;
};
