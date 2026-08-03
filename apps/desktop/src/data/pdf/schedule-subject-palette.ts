import { rgb, type Color } from 'pdf-lib';

const SUBJECT_PALETTE_SIZE = 8;

export type SubjectPaletteSlot = {
  readonly background: Color;
  readonly foreground: Color;
  readonly border: Color;
};

function hex(value: string): Color {
  const r = Number.parseInt(value.slice(1, 3), 16) / 255;
  const g = Number.parseInt(value.slice(3, 5), 16) / 255;
  const b = Number.parseInt(value.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

// `pdf-lib` can't consume a CSS custom property, so this is the compiled
// light-mode equivalent of `packages/ui/src/styles/tokens.css`'s `--subject-N-*`
// slots (the same palette `session-block.tsx` renders on screen) — kept in sync
// by hand so a printed grid colour-codes subjects identically to the live one.
const PALETTE: readonly SubjectPaletteSlot[] = [
  { background: hex('#f0fdfa'), foreground: hex('#0f766e'), border: hex('#99f6e4') },
  { background: hex('#eff6ff'), foreground: hex('#1d4ed8'), border: hex('#bfdbfe') },
  { background: hex('#f5f3ff'), foreground: hex('#6d28d9'), border: hex('#ddd6fe') },
  { background: hex('#fffbeb'), foreground: hex('#b45309'), border: hex('#fde68a') },
  { background: hex('#fff1f2'), foreground: hex('#be123c'), border: hex('#fecdd3') },
  { background: hex('#f0fdf4'), foreground: hex('#15803d'), border: hex('#bbf7d0') },
  { background: hex('#ecfeff'), foreground: hex('#0e7490'), border: hex('#a5f3fc') },
  { background: hex('#fff7ed'), foreground: hex('#c2410c'), border: hex('#fed7aa') },
];

const NEUTRAL_SLOT: SubjectPaletteSlot = {
  background: rgb(0.95, 0.95, 0.96),
  foreground: rgb(0.35, 0.37, 0.39),
  border: rgb(0.82, 0.83, 0.85),
};

/** Same deterministic hash `subject-color.ts` uses, reimplemented here since the
 *  renderer's lib file isn't reachable from the data layer. */
function subjectColorIndex(subjectId: string): number {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i += 1) {
    hash = (hash * 31 + subjectId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % SUBJECT_PALETTE_SIZE;
}

/** Resolves a subject id to its print colours; `null` (no live/known subject,
 *  mirroring `WeeklySessionView`'s own neutral fallback) gets the neutral slot. */
export function subjectPaletteSlot(subjectId: string | null): SubjectPaletteSlot {
  if (subjectId === null) return NEUTRAL_SLOT;
  return PALETTE[subjectColorIndex(subjectId)] ?? NEUTRAL_SLOT;
}

// Exam-prep kind styling — compiled equivalent of `--kind-exam-*` in
// `tokens.css`, mirroring `KindBadge`'s dashed-purple treatment (CLAUDE.md §7:
// exam-prep must stay visually separable from regular).
export const EXAM_PREP_BORDER_COLOR: Color = hex('#d8b4fe');
export const EXAM_PREP_BADGE_BACKGROUND: Color = hex('#faf5ff');
export const EXAM_PREP_BADGE_FOREGROUND: Color = hex('#7e22ce');
