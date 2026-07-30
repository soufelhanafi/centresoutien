import type { StudentView } from '../students/student-view';
import type { ParentInput, ParentListFilter, ParentView } from './parent-view';
import type { ParentsGateway } from './parents-gateway';

/**
 * The real {@link ParentsGateway}: maps each method onto its typed IPC channel
 * (SOU-40/SOU-41). No business logic — the domain use cases behind the channels
 * own it. `create` reuses the pre-existing `parent.create` channel (which returns
 * only the new id) and reads the full view back through `get`, so a freshly
 * created parent flows through the exact same projection as every other read.
 */
class IpcParentsGateway implements ParentsGateway {
  async list(filter: ParentListFilter): Promise<readonly ParentView[]> {
    const { parents } = await window.api.invoke('parent.list', { search: filter.search });
    return parents;
  }

  async get(id: string): Promise<ParentView | null> {
    const { parent } = await window.api.invoke('parent.get', { id });
    return parent;
  }

  async create(input: ParentInput): Promise<ParentView> {
    const { id } = await window.api.invoke('parent.create', input);
    const created = await this.get(id);
    if (created === null) {
      throw new Error(`parent ${id} was created but could not be read back`);
    }
    return created;
  }

  async update(id: string, input: ParentInput): Promise<ParentView> {
    const { parent } = await window.api.invoke('parent.update', { ...input, id });
    return parent;
  }

  async archive(id: string): Promise<void> {
    await window.api.invoke('parent.archive', { id });
  }

  async children(id: string): Promise<readonly StudentView[]> {
    const { students } = await window.api.invoke('parent.children', { id });
    return students;
  }
}

export const ipcParentsGateway: ParentsGateway = new IpcParentsGateway();
