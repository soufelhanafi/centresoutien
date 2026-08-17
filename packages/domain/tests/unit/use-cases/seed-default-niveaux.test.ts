import { describe, it, expect } from 'vitest';
import {
  NIVEAU_SEED_CATALOG,
  newDefaultNiveaux,
} from '../../../src/use-cases/seed-default-niveaux';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('NIVEAU_SEED_CATALOG', () => {
  it('covers the standard Moroccan levels: 6 primaire, 3 college, 14 lycee', () => {
    const primaire = NIVEAU_SEED_CATALOG.filter((n) => n.category === 'primaire');
    const college = NIVEAU_SEED_CATALOG.filter((n) => n.category === 'college');
    const lycee = NIVEAU_SEED_CATALOG.filter((n) => n.category === 'lycee');

    expect(primaire.map((n) => n.code)).toEqual(['1AP', '2AP', '3AP', '4AP', '5AP', '6AP']);
    expect(college.map((n) => n.code)).toEqual(['1AC', '2AC', '3AC']);
    expect(lycee).toHaveLength(14);
    expect(NIVEAU_SEED_CATALOG).toHaveLength(23);
  });

  it('has a bilingual name for every level and unique codes', () => {
    const codes = new Set(NIVEAU_SEED_CATALOG.map((n) => n.code));
    expect(codes.size).toBe(NIVEAU_SEED_CATALOG.length);
    for (const level of NIVEAU_SEED_CATALOG) {
      expect(level.name.fr.length).toBeGreaterThan(0);
      expect(level.name.ar.length).toBeGreaterThan(0);
    }
  });
});

describe('newDefaultNiveaux', () => {
  it('builds one active Niveau per catalog entry with a fresh envelope', () => {
    const rows = newDefaultNiveaux(
      { centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER },
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
    );

    expect(rows).toHaveLength(NIVEAU_SEED_CATALOG.length);
    for (const [index, row] of rows.entries()) {
      expect(row.id).toMatch(/^niv_/);
      expect(row.code).toBe(NIVEAU_SEED_CATALOG[index]?.code);
      expect(row.category).toBe(NIVEAU_SEED_CATALOG[index]?.category);
      expect(row.name).toEqual(NIVEAU_SEED_CATALOG[index]?.name);
      expect(row.active).toBe(true);
      expect(row.centerCode).toBe(CENTER);
      expect(row.deletedAt).toBeNull();
      expect(row.version).toBe(0);
      expect(row.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(row.updatedAt).toEqual(row.createdAt);
    }
  });
});
