import { describe, it, expect } from 'vitest';
import {
  subjectColor,
  subjectColorIndex,
  SUBJECT_PALETTE_SIZE,
} from '../../../src/renderer/lib/planning/subject-color';

describe('subjectColorIndex', () => {
  it('is deterministic for the same subject id', () => {
    expect(subjectColorIndex('math')).toBe(subjectColorIndex('math'));
  });

  it('always lands within the palette range', () => {
    for (const id of ['math', 'physique', 'svt', 'anglais', 'arabe', 'philo', '', 'x']) {
      const i = subjectColorIndex(id);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(SUBJECT_PALETTE_SIZE);
      expect(Number.isInteger(i)).toBe(true);
    }
  });
});

describe('subjectColor', () => {
  it('references the CSS vars for the hashed palette slot', () => {
    const i = subjectColorIndex('physique');
    expect(subjectColor('physique')).toEqual({
      background: `var(--subject-${i}-bg)`,
      foreground: `var(--subject-${i}-fg)`,
      border: `var(--subject-${i}-border)`,
    });
  });

  it('falls back to neutral muted colours for an unknown subject (null id)', () => {
    expect(subjectColor(null)).toEqual({
      background: 'var(--muted)',
      foreground: 'var(--muted-foreground)',
      border: 'var(--border)',
    });
  });
});
