import type { CenterHoursOverridesGateway } from './overrides-gateway';
import type { CenterHoursOverrideInput, CenterHoursOverrideView } from './override-view';

/**
 * In-memory stand-in for the not-yet-published override channels (see
 * {@link ./overrides-gateway.CenterHoursOverridesGateway} for the contract
 * requested from the domain). It lets the whole flow — the Settings manager and
 * the planner's live gray-out — run end-to-end in both locales before the
 * SQLite-backed IPC handlers exist. A single module instance is shared, so an
 * override created in Settings is immediately the one the planner reads back
 * through `getActive`.
 *
 * Deliberately not a React store: it models the server, so the UI drives it
 * through TanStack Query exactly as it will the real adapter. Seeded empty so the
 * planner keeps its base-hours appearance until an override is actually created.
 */
function newId(): string {
  const rand = Math.random().toString(36).slice(2).toUpperCase().padEnd(20, '0');
  return `cho_MOCK${rand.slice(0, 22)}`;
}

class MockCenterHoursOverridesGateway implements CenterHoursOverridesGateway {
  private readonly overrides = new Map<string, CenterHoursOverrideView>();

  async list(): Promise<readonly CenterHoursOverrideView[]> {
    return [...this.overrides.values()].sort((a, b) =>
      b.dateRange.start.localeCompare(a.dateRange.start),
    );
  }

  async save(input: CenterHoursOverrideInput): Promise<CenterHoursOverrideView> {
    const override: CenterHoursOverrideView = {
      id: newId(),
      dateRange: input.dateRange,
      hoursByWeekday: input.hoursByWeekday,
      createdAt: new Date().toISOString(),
    };
    this.overrides.set(override.id, override);
    return override;
  }

  async getActive(date: string): Promise<CenterHoursOverrideView | null> {
    const active = [...this.overrides.values()]
      .filter((override) => override.dateRange.start <= date && date <= override.dateRange.end)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return active[0] ?? null;
  }
}

export const mockCenterHoursOverridesGateway: CenterHoursOverridesGateway =
  new MockCenterHoursOverridesGateway();
