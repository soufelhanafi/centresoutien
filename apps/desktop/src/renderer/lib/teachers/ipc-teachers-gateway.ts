import type { TeacherInput, TeacherListFilter, TeacherView } from './teacher-view';
import type { TeachersGateway } from './teachers-gateway';

/**
 * The real {@link TeachersGateway}: maps each method onto its typed IPC channel
 * (SOU-36 domain/data). No business logic — the domain use cases behind the
 * channels own it. `create` uses the `teacher.create` channel (which returns only
 * the new id) and reads the full view back through `get`, so a freshly created
 * teacher flows through the exact same projection as every other read — mirroring
 * `IpcStudentsGateway`.
 */
class IpcTeachersGateway implements TeachersGateway {
  async list(filter: TeacherListFilter): Promise<readonly TeacherView[]> {
    const { teachers } = await window.api.invoke('teacher.list', { search: filter.search });
    return teachers;
  }

  async get(id: string): Promise<TeacherView | null> {
    const { teacher } = await window.api.invoke('teacher.get', { id });
    return teacher;
  }

  async create(input: TeacherInput): Promise<TeacherView> {
    const { id } = await window.api.invoke('teacher.create', input);
    const created = await this.get(id);
    if (created === null) {
      throw new Error(`teacher ${id} was created but could not be read back`);
    }
    return created;
  }

  async update(id: string, input: TeacherInput): Promise<TeacherView> {
    const { teacher } = await window.api.invoke('teacher.update', { ...input, id });
    return teacher;
  }

  async archive(id: string): Promise<void> {
    await window.api.invoke('teacher.archive', { id });
  }
}

export const ipcTeachersGateway: TeachersGateway = new IpcTeachersGateway();
