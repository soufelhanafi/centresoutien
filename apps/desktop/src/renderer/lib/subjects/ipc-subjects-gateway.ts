import type { SubjectScope, SubjectView } from './subject-view';
import type { SubjectsGateway } from './subjects-gateway';

/**
 * The real {@link SubjectsGateway}: maps each method onto its typed IPC channel
 * (SOU-124 domain/data). No business logic — the domain use cases behind the
 * channels own it. Mirrors `IpcTeachersGateway`.
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
}

export const ipcSubjectsGateway: SubjectsGateway = new IpcSubjectsGateway();
