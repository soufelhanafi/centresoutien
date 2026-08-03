import type { StudentInput, StudentListFilter, StudentView } from './student-view';

/**
 * In-memory stand-in for the not-yet-published Student read/write channels
 * (see `students-gateway.ts` for the contract requested from the domain). It
 * lets the full UI — list, search, create, edit, archive — run end-to-end in
 * both locales before the SQLite-backed IPC handlers exist. Deliberately not a
 * React store: it models the server, so the UI drives it through TanStack Query
 * exactly as it will the real adapter.
 */

const SEED: readonly StudentView[] = [
  {
    id: 'stu_01HW0SEED0000000000000001',
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2008-09-14',
    level: '2 Bac SM',
    school: 'Lycée Ibn Sina',
    notes: null,
    guardianIds: [],
    archived: false,
    createdAt: '2026-02-01T09:00:00.000Z',
    version: 0,
  },
  {
    id: 'stu_01HW0SEED0000000000000002',
    name: { fr: 'Salma Bennani', ar: 'سلمى البناني' },
    birthDate: '2010-03-22',
    level: '3AC',
    school: null,
    notes: 'Groupe du samedi matin.',
    guardianIds: [],
    archived: false,
    createdAt: '2026-02-03T10:30:00.000Z',
    version: 0,
  },
  {
    id: 'stu_01HW0SEED0000000000000003',
    name: { fr: 'Adam Cherkaoui', ar: 'آدم الشرقاوي' },
    birthDate: '2007-11-05',
    level: '1 Bac SE',
    school: 'Lycée Al Khawarizmi',
    notes: null,
    guardianIds: [],
    archived: false,
    createdAt: '2026-02-10T14:15:00.000Z',
    version: 0,
  },
];

function newId(): string {
  const rand = Math.random().toString(36).slice(2).toUpperCase().padEnd(20, '0');
  return `stu_MOCK${rand.slice(0, 22)}`;
}

/** Normalize for accent/case-insensitive substring search across FR + AR. */
// Combining diacritical marks (U+0300–U+036F) — stripped so "École" matches "ecole".
const DIACRITICS = /[\u0300-\u036f]/g;

function normalize(value: string): string {
  return value.normalize('NFKD').replace(DIACRITICS, '').toLowerCase();
}

function matches(student: StudentView, search: string): boolean {
  const needle = normalize(search.trim());
  if (needle === '') return true;
  return [student.name.fr, student.name.ar, student.level].some((field) =>
    normalize(field).includes(needle),
  );
}

function toView(id: string, input: StudentInput, createdAt: string, version: number): StudentView {
  return {
    id,
    name: { fr: input.name.fr, ar: input.name.ar },
    birthDate: input.birthDate,
    level: input.level,
    school: input.school,
    notes: input.notes,
    guardianIds: [...input.guardianIds],
    archived: false,
    createdAt,
    version,
  };
}

export class MockStudentsGateway {
  private readonly students = new Map<string, StudentView>(SEED.map((s) => [s.id, s]));

  async list(filter: StudentListFilter): Promise<readonly StudentView[]> {
    return [...this.students.values()]
      .filter((s) => !s.archived && matches(s, filter.search))
      .sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }

  async get(id: string): Promise<StudentView | null> {
    const found = this.students.get(id);
    return found && !found.archived ? found : null;
  }

  async create(input: StudentInput): Promise<StudentView> {
    const student = toView(newId(), input, new Date().toISOString(), 0);
    this.students.set(student.id, student);
    return student;
  }

  async update(id: string, input: StudentInput): Promise<StudentView> {
    const current = this.students.get(id);
    if (!current) throw new Error(`unknown student ${id}`);
    const updated = {
      ...toView(id, input, current.createdAt, current.version),
      guardianIds: current.guardianIds,
    };
    this.students.set(id, updated);
    return updated;
  }

  async setGuardians(
    id: string,
    guardianIds: readonly string[],
    expectedVersion: number,
  ): Promise<StudentView> {
    const current = this.students.get(id);
    if (!current) throw new Error(`unknown student ${id}`);
    if (current.version !== expectedVersion) {
      throw new Error(`student ${id} has version ${current.version}, expected ${expectedVersion}`);
    }
    const updated = { ...current, guardianIds: [...guardianIds] };
    this.students.set(id, updated);
    return updated;
  }

  async archive(id: string): Promise<void> {
    const current = this.students.get(id);
    if (current) this.students.set(id, { ...current, archived: true });
  }
}

export const mockStudentsGateway = new MockStudentsGateway();
