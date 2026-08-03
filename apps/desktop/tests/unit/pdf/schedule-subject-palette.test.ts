import { describe, it, expect } from 'vitest';
import { subjectPaletteSlot } from '../../../src/data/pdf/schedule-subject-palette';

describe('subjectPaletteSlot', () => {
  it('is deterministic — the same subject id always resolves to the same slot', () => {
    const first = subjectPaletteSlot('sub_00000000000000000000000001');
    const second = subjectPaletteSlot('sub_00000000000000000000000001');
    expect(first).toEqual(second);
  });

  it('resolves a null subject id to the neutral slot', () => {
    const neutral = subjectPaletteSlot(null);
    const withId = subjectPaletteSlot('sub_00000000000000000000000001');
    expect(neutral).not.toEqual(withId);
  });

  it('spreads distinct subject ids across more than one slot', () => {
    const ids = Array.from({ length: 12 }, (_, index) => `sub_${String(index).padStart(26, '0')}`);
    const slots = new Set(ids.map((id) => JSON.stringify(subjectPaletteSlot(id))));
    expect(slots.size).toBeGreaterThan(1);
  });
});
