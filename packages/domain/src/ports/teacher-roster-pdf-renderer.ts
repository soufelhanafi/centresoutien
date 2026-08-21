/** One printed row of the teacher roster PDF — display-ready strings; all
 *  presentation formatting (name, subject/group/formula joins, kind and status
 *  labels) is done by the caller before it reaches the renderer. */
export type TeacherRosterPdfRow = {
  readonly name: string;
  readonly level: string;
  readonly subjects: string;
  readonly formula: string;
  readonly kind: string;
  readonly status: string;
};

/**
 * Everything the teacher-roster PDF needs to lay out (SOU-299) — assembled by the
 * caller (the `teacher.roster.print` / `teacher.roster.export` IPC handlers) from
 * the `GetTeacherRoster` read model, the active filter context, and the center
 * profile. A plain data contract, not a domain decision: the renderer's only job
 * is typography and layout. FR-only per the SOU-279 money/document convention.
 * Sibling of {@link ParentStatementPdfInput}.
 */
export type TeacherRosterPdfInput = {
  /** The teacher whose roster this is — the document's subject, in the header. */
  readonly teacherName: string;
  /** Generation date `YYYY-MM-DD`, stamped by the caller (never `new Date()` here). */
  readonly generatedOn: string;
  /** The active filters, pre-formatted FR lines (e.g. "Matière : Mathématiques"). Empty when unfiltered. */
  readonly filterSummary: readonly string[];
  readonly rows: readonly TeacherRosterPdfRow[];
  readonly center: {
    readonly name: string;
    readonly address: string;
    readonly phone: string;
    readonly email: string;
    readonly logoBytes: Uint8Array | null;
  };
};

/**
 * Renders the teacher's filtered student roster to a print-ready PDF. Implemented
 * in the data layer (`pdf-lib`); the domain only declares the contract so the same
 * seam can later target a browser bundle. Deterministic for a given input save for
 * the PDF library's own creation-date metadata.
 */
export interface TeacherRosterPdfRenderer {
  render(input: TeacherRosterPdfInput): Promise<Uint8Array>;
}
