import type { StudentInput, StudentListFilter, StudentView } from './student-view';
import type { StudentsGateway } from './students-gateway';

/**
 * The real {@link StudentsGateway}: maps each method onto its typed IPC channel
 * (SOU-38/SOU-39). No business logic — the domain use cases behind the channels
 * own it. `create` reuses the pre-existing `student.create` channel (which
 * returns only the new id) and reads the full view back through `get`, so a
 * freshly created student flows through the exact same projection as every other
 * read.
 */
class IpcStudentsGateway implements StudentsGateway {
  async list(filter: StudentListFilter): Promise<readonly StudentView[]> {
    const { students } = await window.api.invoke('student.list', { search: filter.search });
    return students;
  }

  async get(id: string): Promise<StudentView | null> {
    const { student } = await window.api.invoke('student.get', { id });
    return student;
  }

  async create(input: StudentInput): Promise<StudentView> {
    const { id } = await window.api.invoke('student.create', input);
    const created = await this.get(id);
    if (created === null) {
      throw new Error(`student ${id} was created but could not be read back`);
    }
    return created;
  }

  async update(id: string, input: StudentInput): Promise<StudentView> {
    const { student } = await window.api.invoke('student.update', { ...input, id });
    return student;
  }

  async setGuardians(
    id: string,
    guardianIds: readonly string[],
    expectedVersion: number,
  ): Promise<StudentView> {
    const { student } = await window.api.invoke('student.setGuardians', {
      id,
      guardianIds: [...guardianIds],
      expectedVersion,
    });
    return student;
  }

  async archive(id: string): Promise<void> {
    await window.api.invoke('student.archive', { id });
  }
}

export const ipcStudentsGateway: StudentsGateway = new IpcStudentsGateway();
