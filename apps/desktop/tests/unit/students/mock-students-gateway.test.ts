import { describe, expect, it } from 'vitest';
import type { StudentInput } from '@centresoutien/domain';
import { MockStudentsGateway } from '../../../src/renderer/lib/students/mock-students-gateway';

function input(overrides: Partial<StudentInput> = {}): StudentInput {
  return {
    name: { fr: 'Nadia Idrissi', ar: 'نادية الإدريسي' },
    birthDate: '2011-06-01',
    level: '1AC',
    school: null,
    notes: null,
    guardianIds: [],
    ...overrides,
  };
}

describe('MockStudentsGateway', () => {
  it('lists the seeded students sorted by French name', async () => {
    const gateway = new MockStudentsGateway();
    const list = await gateway.list({ search: '' });
    expect(list.map((s) => s.name.fr)).toEqual(['Adam Cherkaoui', 'Salma Bennani', 'Yassine Alaoui']);
  });

  it('filters by French name, Arabic name, and level', async () => {
    const gateway = new MockStudentsGateway();
    expect(await gateway.list({ search: 'salma' })).toHaveLength(1);
    expect(await gateway.list({ search: 'العلوي' })).toHaveLength(1);
    expect((await gateway.list({ search: '3AC' }))[0]?.name.fr).toBe('Salma Bennani');
  });

  it('creates a student that then appears in the list and by id', async () => {
    const gateway = new MockStudentsGateway();
    const created = await gateway.create(input());
    expect(created.archived).toBe(false);
    expect(await gateway.get(created.id)).toEqual(created);
    expect(await gateway.list({ search: 'nadia' })).toHaveLength(1);
  });

  it('updates editable fields while preserving guardian links', async () => {
    const gateway = new MockStudentsGateway();
    const created = await gateway.create(input({ guardianIds: [] }));
    const updated = await gateway.update(created.id, input({ level: '2AC', school: 'Lycée Zerktouni' }));
    expect(updated.level).toBe('2AC');
    expect(updated.school).toBe('Lycée Zerktouni');
    expect(updated.id).toBe(created.id);
  });

  it('archives (soft-deletes) so the student drops from list and get', async () => {
    const gateway = new MockStudentsGateway();
    const created = await gateway.create(input());
    await gateway.archive(created.id);
    expect(await gateway.get(created.id)).toBeNull();
    expect(await gateway.list({ search: 'nadia' })).toHaveLength(0);
  });
});
