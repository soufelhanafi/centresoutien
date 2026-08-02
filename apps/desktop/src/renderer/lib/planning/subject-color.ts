/**
 * Deterministic subject → colour mapping for the planner blocks.
 *
 * Subjects are center-defined (no fixed list, no colour field on the entity), so
 * a block's colour is derived from a stable hash of its `subjectId` onto a fixed
 * palette. The same subject always lands on the same slot, and the palette is
 * theme-aware — the slots are CSS custom properties defined in `tokens.css` for
 * both light and dark, so we reference the vars rather than baking hex here.
 */
export const SUBJECT_PALETTE_SIZE = 8;

/** Stable non-negative hash of a subject id onto `0 … SUBJECT_PALETTE_SIZE - 1`. */
export function subjectColorIndex(subjectId: string): number {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i += 1) {
    hash = (hash * 31 + subjectId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % SUBJECT_PALETTE_SIZE;
}

/** The three CSS-var references (bg / fg / border) for a subject's block. */
export type SubjectColor = {
  readonly background: string;
  readonly foreground: string;
  readonly border: string;
};

/**
 * Neutral, theme-aware block colours for a session whose subject is unknown — no
 * live group, or the group's subject is archived (`subjectId === null`). It reads
 * as muted so a colourless block is visibly "unclassified" rather than borrowing a
 * real subject's slot.
 */
const NEUTRAL_COLOR: SubjectColor = {
  background: 'var(--muted)',
  foreground: 'var(--muted-foreground)',
  border: 'var(--border)',
};

/**
 * Resolves a subject id to its theme-aware block colours (CSS var references).
 * A `null` id (session with no live/known subject) maps to the neutral colours.
 */
export function subjectColor(subjectId: string | null): SubjectColor {
  if (subjectId === null) return NEUTRAL_COLOR;
  const i = subjectColorIndex(subjectId);
  return {
    background: `var(--subject-${i}-bg)`,
    foreground: `var(--subject-${i}-fg)`,
    border: `var(--subject-${i}-border)`,
  };
}
