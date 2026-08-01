import { describe, it, expect } from 'vitest';
import { FORMULA_ID_PREFIX } from '../../../src/entities/formula';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import { hasIdPrefix } from '../../../src/value-objects/ids';
import { newEnvelope } from '../../../src/entities/envelope';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const MATH = 'sub_00000000000000000000000003' as SubjectId;
const PHYS = 'sub_00000000000000000000000004' as SubjectId;
const FORMULA_ID = `${FORMULA_ID_PREFIX}_00000000000000000000000001` as FormulaId;

function makeFormula(): Formula {
  return {
    id: FORMULA_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    name: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
    subjectIds: [MATH, PHYS],
    priceMad: 35000,
    kind: 'regular',
    isImmutable: false,
    active: true,
  };
}

/** Re-hydrates the `Date` fields a plain `JSON.parse` widens to ISO strings —
 *  exactly what a Formula crossing a JSON wire (IPC / future sync payload) needs. */
function reviveDates(raw: Record<string, unknown>): unknown {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
    deletedAt: raw.deletedAt === null ? null : new Date(raw.deletedAt as string),
  };
}

describe('Formula', () => {
  it('FORMULA_ID_PREFIX identifies its ids', () => {
    expect(hasIdPrefix(FORMULA_ID, FORMULA_ID_PREFIX)).toBe(true);
    expect(FORMULA_ID_PREFIX).toBe('fml');
  });

  it('full serialization roundtrip: every field survives JSON.stringify → JSON.parse', () => {
    const formula = makeFormula();

    const revived = reviveDates(JSON.parse(JSON.stringify(formula)) as Record<string, unknown>);

    expect(revived).toEqual(formula);
  });

  it('roundtrip preserves a tombstoned (soft-deleted) formula', () => {
    const formula: Formula = {
      ...makeFormula(),
      deletedAt: new Date('2026-08-02T12:00:00Z'),
      active: false,
    };

    const revived = reviveDates(JSON.parse(JSON.stringify(formula)) as Record<string, unknown>);

    expect(revived).toEqual(formula);
  });

  it('roundtrip preserves an isImmutable formula and its exam-prep kind', () => {
    const formula: Formula = {
      ...makeFormula(),
      kind: 'exam-prep',
      isImmutable: true,
    };

    const revived = reviveDates(JSON.parse(JSON.stringify(formula)) as Record<string, unknown>);

    expect(revived).toEqual(formula);
    expect((revived as Formula).isImmutable).toBe(true);
  });

  it('roundtrip preserves subjectIds order (no accidental dedup/sort)', () => {
    const formula: Formula = { ...makeFormula(), subjectIds: [PHYS, MATH] };

    const revived = reviveDates(JSON.parse(JSON.stringify(formula)) as Record<string, unknown>);

    expect((revived as Formula).subjectIds).toEqual([PHYS, MATH]);
  });
});
