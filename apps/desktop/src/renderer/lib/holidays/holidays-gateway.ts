import type { HolidayInput, HolidayListFilter, HolidayView } from './holiday-view';
import { ipcHolidaysGateway } from './ipc-holidays-gateway';

/**
 * The seam the Holidays UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-30 frontend ↔ domain)
 *
 * All five channels are now published (`holiday.list / create / update / archive
 * / restore`) with their SQLite-backed IPC handlers, so this ships against the
 * real {@link ipcHolidaysGateway}.
 */
export interface HolidaysGateway {
  list(filter: HolidayListFilter): Promise<readonly HolidayView[]>;
  create(input: HolidayInput): Promise<HolidayView>;
  update(id: string, input: HolidayInput): Promise<HolidayView>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const holidaysGateway: HolidaysGateway = ipcHolidaysGateway;
