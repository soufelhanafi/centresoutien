import { describe, it, expect } from 'vitest';
import { updateFormula } from '../../../src/policies/formula-policy';
import { FormulaImmutableError } from '../../../src/errors/formula-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const AUTHOR = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const MATH = 'sub_00000000000000000000000003' as SubjectId;
const PHYS = 'sub_00000000000000000000000004' as SubjectId;
const FORMULA_ID = 'fml_00000000000000000000000001' as FormulaId;

function makeFormula(overrides: Partial<Formula> = {}): Formula {
  return {
    id: FORMULA_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: AUTHOR }, fakeClock()),
    name: { fr: 'Math seul', ar: 'الرياضيات فقط' },
    subjectIds: [MATH],
    priceMad: 20000,
    kind: 'regular',
    isImmutable: false,
    active: true,
    ...overrides,
  };
}

describe('updateFormula', () => {
  describe('mutable formula (isImmutable: false)', () => {
    it('applies a price patch, bumping updatedAt/updatedBy', () => {
      const prev = makeFormula();
      const clock = fakeClock('2026-08-02T09:00:00Z');

      const { next, changedFields } = updateFormula(
        prev,
        { priceMad: 25000 },
        { clock, updatedBy: EDITOR },
      );

      expect(next.priceMad).toBe(25000);
      expect(next.updatedAt).toEqual(new Date('2026-08-02T09:00:00Z'));
      expect(next.updatedBy).toBe(EDITOR);
      expect(changedFields).toEqual(['priceMad']);
    });

    it('applies a subjectIds patch', () => {
      const prev = makeFormula();
      const { next } = updateFormula(
        prev,
        { subjectIds: [MATH, PHYS] },
        { clock: fakeClock(), updatedBy: EDITOR },
      );
      expect(next.subjectIds).toEqual([MATH, PHYS]);
    });

    it('applies a name and active patch together', () => {
      const prev = makeFormula();
      const { next, changedFields } = updateFormula(
        prev,
        { name: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' }, active: false },
        { clock: fakeClock(), updatedBy: EDITOR },
      );
      expect(next.name).toEqual({ fr: 'Math + Physique', ar: 'رياضيات وفيزياء' });
      expect(next.active).toBe(false);
      expect(new Set(changedFields)).toEqual(new Set(['name', 'active']));
    });

    it('is idempotent: a no-op patch changes nothing and does not bump updatedAt', () => {
      const prev = makeFormula();
      const { next, changedFields } = updateFormula(
        prev,
        { priceMad: prev.priceMad },
        { clock: fakeClock('2027-01-01T00:00:00Z'), updatedBy: EDITOR },
      );
      expect(changedFields).toEqual([]);
      expect(next).toBe(prev);
    });

    it('never touches version — that is the hub-assigned counter', () => {
      const prev = makeFormula();
      const { next } = updateFormula(
        prev,
        { priceMad: 30000 },
        { clock: fakeClock(), updatedBy: EDITOR },
      );
      expect(next.version).toBe(prev.version);
    });
  });

  describe('the immutability barrier (isImmutable: true)', () => {
    it('rejects a priceMad patch with FormulaImmutableError', () => {
      const prev = makeFormula({ isImmutable: true });
      expect(() =>
        updateFormula(prev, { priceMad: 25000 }, { clock: fakeClock(), updatedBy: EDITOR }),
      ).toThrow(FormulaImmutableError);
    });

    it('rejects a subjectIds patch', () => {
      const prev = makeFormula({ isImmutable: true });
      expect(() =>
        updateFormula(prev, { subjectIds: [PHYS] }, { clock: fakeClock(), updatedBy: EDITOR }),
      ).toThrow(FormulaImmutableError);
    });

    it('rejects a kind patch', () => {
      const prev = makeFormula({ isImmutable: true });
      expect(() =>
        updateFormula(prev, { kind: 'exam-prep' }, { clock: fakeClock(), updatedBy: EDITOR }),
      ).toThrow(FormulaImmutableError);
    });

    it('rejects even a cosmetic name-only patch — a used formula is frozen history', () => {
      const prev = makeFormula({ isImmutable: true });
      expect(() =>
        updateFormula(
          prev,
          { name: { fr: 'Renamed', ar: 'إعادة تسمية' } },
          { clock: fakeClock(), updatedBy: EDITOR },
        ),
      ).toThrow(FormulaImmutableError);
    });

    it('rejects an active-only toggle', () => {
      const prev = makeFormula({ isImmutable: true });
      expect(() =>
        updateFormula(prev, { active: false }, { clock: fakeClock(), updatedBy: EDITOR }),
      ).toThrow(FormulaImmutableError);
    });

    it('rejects an empty patch — the barrier trips on the write attempt itself', () => {
      const prev = makeFormula({ isImmutable: true });
      expect(() => updateFormula(prev, {}, { clock: fakeClock(), updatedBy: EDITOR })).toThrow(
        FormulaImmutableError,
      );
    });

    it('the thrown error carries the formula id', () => {
      const prev = makeFormula({ isImmutable: true });
      try {
        updateFormula(prev, { priceMad: 1 }, { clock: fakeClock(), updatedBy: EDITOR });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(FormulaImmutableError);
        expect((error as FormulaImmutableError).formulaId).toBe(FORMULA_ID);
        expect((error as FormulaImmutableError).code).toBe('formula-immutable');
      }
    });
  });
});
