import type { SubjectInput, SubjectScope, SubjectUpdateInput, SubjectUsageView, SubjectView } from './subject-view';
import type { SubjectsGateway } from './subjects-gateway';

/**
 * The real {@link SubjectsGateway}: maps each method onto its typed IPC channel
 * (SOU-124 name/read channels, SOU-46/SOU-47/SOU-135 CRUD + usage channels). No
 * business logic — the domain use cases behind the channels own it. `create`
 * echoes only the new id, so the fresh subject is read back through `get` — the
 * same projection as every other read. Mirrors `IpcTeachersGateway`.
 */
class IpcSubjectsGateway implements SubjectsGateway {
  async list(scope: SubjectScope): Promise<readonly SubjectView[]> {
    const { subjects } = await window.api.invoke('subject.list', { scope });
    return subjects;
  }

  async get(id: string): Promise<SubjectView | null> {
    const { subject } = await window.api.invoke('subject.get', { id });
    return subject;
  }

  async listWithUsage(): Promise<readonly SubjectUsageView[]> {
    const { subjects } = await window.api.invoke('subject.listWithUsage', {});
    return subjects;
  }

  async create(input: SubjectInput): Promise<SubjectView> {
    const { id } = await window.api.invoke('subject.create', input);
    const created = await this.get(id);
    if (created === null) {
      throw new Error(`subject ${id} was created but could not be read back`);
    }
    return created;
  }

  async update(id: string, input: SubjectUpdateInput): Promise<SubjectView> {
    const { subject } = await window.api.invoke('subject.update', { ...input, id });
    return subject;
  }

  async archive(id: string): Promise<void> {
    await window.api.invoke('subject.archive', { id });
  }
}

export const ipcSubjectsGateway: SubjectsGateway = new IpcSubjectsGateway();
