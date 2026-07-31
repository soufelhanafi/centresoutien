import type { HolidayInput, HolidayListFilter, HolidayView } from './holiday-view';
import type { HolidaysGateway } from './holidays-gateway';

/**
 * The real {@link HolidaysGateway}: maps each method onto its typed IPC channel
 * (SOU-30). No business logic — the domain use cases behind the channels own it.
 *
 * One boundary rename: the UI's lifecycle filter is `status` (`active` /
 * `archived`), while the `holiday.list` channel names it `scope`. This adapter
 * translates the one word so no component learns the wire vocabulary.
 *
 * `holiday.create` echoes only the new id (mirroring `room.create`), so the fresh
 * holiday is read back from the active list — the same projection as every other
 * read, no fabricated fields.
 */
class IpcHolidaysGateway implements HolidaysGateway {
  async list(filter: HolidayListFilter): Promise<readonly HolidayView[]> {
    const { holidays } = await window.api.invoke('holiday.list', { scope: filter.status });
    return holidays;
  }

  async create(input: HolidayInput): Promise<HolidayView> {
    const { id } = await window.api.invoke('holiday.create', input);
    const created = (await this.list({ status: 'active' })).find((holiday) => holiday.id === id);
    if (created === undefined) {
      throw new Error(`holiday ${id} was created but could not be read back`);
    }
    return created;
  }

  async update(id: string, input: HolidayInput): Promise<HolidayView> {
    const { holiday } = await window.api.invoke('holiday.update', { ...input, id });
    return holiday;
  }

  async archive(id: string): Promise<void> {
    await window.api.invoke('holiday.archive', { id });
  }

  async restore(id: string): Promise<void> {
    await window.api.invoke('holiday.restore', { id });
  }
}

export const ipcHolidaysGateway: HolidaysGateway = new IpcHolidaysGateway();
