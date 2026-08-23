import { describe, expect, it } from 'vitest';
import {
  filterRowsByName,
  sortRows,
} from '../../../src/renderer/lib/multi-center-stats/sort-rows';
import type { MultiCenterStatsRowView } from '../../../src/renderer/lib/multi-center-stats/multi-center-stats-view';

function row(overrides: Partial<MultiCenterStatsRowView>): MultiCenterStatsRowView {
  return {
    centreId: overrides.centreId ?? 'ctr',
    centerCode: overrides.centerCode ?? 'CS-X',
    displayName: overrides.displayName ?? 'Centre X',
    revenueMad: overrides.revenueMad ?? 0,
    collectedMad: overrides.collectedMad ?? 0,
    studentCount: overrides.studentCount ?? 0,
    unpaidRate: overrides.unpaidRate ?? null,
    momGrowthPercent: overrides.momGrowthPercent ?? null,
    unavailable: overrides.unavailable ?? false,
  };
}

const casa = row({ centreId: 'a', displayName: 'Al Amal', revenueMad: 500, momGrowthPercent: 6 });
const rabat = row({ centreId: 'b', displayName: 'Bnajah', revenueMad: 300, momGrowthPercent: -3 });
const fes = row({ centreId: 'c', displayName: 'Al Fajr', revenueMad: 0, unavailable: true });

const ids = (rows: readonly MultiCenterStatsRowView[]) => rows.map((r) => r.centreId);

describe('sortRows', () => {
  it('sorts numeric columns descending with unavailable rows last', () => {
    expect(ids(sortRows([rabat, casa, fes], { key: 'revenueMad', direction: 'desc' }))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('sorts numeric columns ascending, still sinking unavailable rows', () => {
    expect(ids(sortRows([casa, fes, rabat], { key: 'revenueMad', direction: 'asc' }))).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('sinks null figures to the bottom regardless of direction', () => {
    const withNull = row({ centreId: 'n', momGrowthPercent: null });
    const sorted = sortRows([withNull, casa, rabat], { key: 'momGrowthPercent', direction: 'asc' });
    expect(ids(sorted).at(-1)).toBe('n');
  });

  it('sorts the center column alphabetically', () => {
    expect(ids(sortRows([casa, rabat], { key: 'displayName', direction: 'asc' }))).toEqual(['a', 'b']);
  });
});

describe('filterRowsByName', () => {
  it('matches on display name, case-insensitively', () => {
    expect(ids(filterRowsByName([casa, rabat], 'amal'))).toEqual(['a']);
  });

  it('matches on center code', () => {
    const coded = row({ centreId: 'z', centerCode: 'CS-CASA-001', displayName: 'Zed' });
    expect(ids(filterRowsByName([coded, rabat], 'casa'))).toEqual(['z']);
  });

  it('returns every row for an empty query', () => {
    expect(filterRowsByName([casa, rabat], '  ')).toHaveLength(2);
  });
});
