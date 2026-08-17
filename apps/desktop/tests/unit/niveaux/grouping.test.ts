import { describe, expect, it } from 'vitest';
import type { NiveauUsageView } from '../../../src/renderer/lib/niveaux/niveau-view';
import { groupNiveauxByCategory, totalNiveauUsage } from '../../../src/renderer/lib/niveaux/grouping';

function usage(id: string, category: NiveauUsageView['niveau']['category'], code: string | null): NiveauUsageView {
  return {
    niveau: {
      id: `niv_${id}`,
      name: { fr: `Niveau ${id}`, ar: `مستوى ${id}` },
      code,
      category,
      active: true,
    },
    inUseCount: 0,
    canDelete: true,
    references: [],
  };
}

const rows: NiveauUsageView[] = [
  usage('1ac', 'college', '1AC'),
  usage('2ac', 'college', '2AC'),
  usage('1ap', 'primaire', '1AP'),
  usage('tc', 'lycee', null),
];

describe('groupNiveauxByCategory', () => {
  it('keeps the fixed category order and returns every category', () => {
    const groups = groupNiveauxByCategory(rows);
    expect(groups.map((g) => g.category)).toEqual(['primaire', 'college', 'lycee']);
  });

  it('groups levels under their category', () => {
    const groups = groupNiveauxByCategory(rows);
    expect(groups.find((g) => g.category === 'college')?.niveaux.map((u) => u.niveau.id)).toEqual([
      'niv_1ac',
      'niv_2ac',
    ]);
  });

  it('sorts a category by code ascending, null codes last', () => {
    const groups = groupNiveauxByCategory(rows);
    expect(groups.find((g) => g.category === 'lycee')?.niveaux.map((u) => u.niveau.code)).toEqual([
      null,
    ]);
  });

  it('keeps empty categories (a center may lack a cycle yet)', () => {
    const groups = groupNiveauxByCategory([usage('1ap', 'primaire', '1AP')]);
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.category === 'lycee')?.niveaux).toHaveLength(0);
  });
});

describe('totalNiveauUsage', () => {
  it('reads the in-use count', () => {
    expect(totalNiveauUsage({ ...usage('x', 'primaire', '1AP'), inUseCount: 6, canDelete: false })).toBe(6);
  });
});
