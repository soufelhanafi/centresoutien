import type { CenterHoursOverridesGateway } from './overrides-gateway';
import type { CenterHoursOverrideInput, CenterHoursOverrideView } from './override-view';

/**
 * In-memory {@link CenterHoursOverridesGateway} for unit tests: it models the
 * server (live vs archived overrides, active-on-date lookup) so a test can drive
 * the UI through TanStack Query exactly as it will the real IPC adapter, without
 * Electron. Not used on the runtime path — the app ships against
 * `ipcCenterHoursOverridesGateway`.
 */
function newId(): string {
  const rand = Math.random().toString(36).slice(2).toUpperCase().padEnd(20, '0');
  return `cho_MOCK${rand.slice(0, 22)}`;
}

export class MockCenterHoursOverridesGateway implements CenterHoursOverridesGateway {
  private readonly overrides = new Map<string, CenterHoursOverrideView>();
  // A monotonic save counter, not the wall clock, stamps `createdAt`, so
  // `getActive`'s newest-wins tiebreak is deterministic in tests.
  private saveSequence = 0;

  async list(range?: { start: string; end: string }): Promise<readonly CenterHoursOverrideView[]> {
    return [...this.overrides.values()]
      .filter((override) => !override.archived)
      .filter(
        (override) =>
          range === undefined ||
          (override.dateRange.start <= range.end && override.dateRange.end >= range.start),
      )
      .sort((a, b) => b.dateRange.start.localeCompare(a.dateRange.start));
  }

  async save(input: CenterHoursOverrideInput): Promise<CenterHoursOverrideView> {
    const override: CenterHoursOverrideView = {
      id: newId(),
      dateRange: input.dateRange,
      hoursByWeekday: input.hoursByWeekday,
      archived: false,
      createdAt: new Date((this.saveSequence += 1) * 1000).toISOString(),
    };
    this.overrides.set(override.id, override);
    return override;
  }

  async getActive(date: string): Promise<CenterHoursOverrideView | null> {
    const active = [...this.overrides.values()]
      .filter(
        (override) =>
          !override.archived &&
          override.dateRange.start <= date &&
          date <= override.dateRange.end,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return active[0] ?? null;
  }

  async archive(id: string): Promise<void> {
    const current = this.overrides.get(id);
    if (current) this.overrides.set(id, { ...current, archived: true });
  }
}

export const mockCenterHoursOverridesGateway: CenterHoursOverridesGateway =
  new MockCenterHoursOverridesGateway();
