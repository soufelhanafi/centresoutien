import type { SessionInput } from './session-form-schema';
import type { SessionWriteGateway } from './session-write-gateway';

/**
 * Interim {@link SessionWriteGateway} used until the SOU-131 backend publishes the
 * `session.create` / `session.update` / `session.cancel` channels. It accepts
 * every write (no persistence), so the create/edit form flows are fully
 * exercisable in dev and unit tests without Electron. Inline conflict handling is
 * proven by rejecting a mutation with an `Error` whose message carries a domain
 * error class name (which `mapSessionWriteError` matches), not from here.
 *
 * At integration, an `ipc-session-write-gateway.ts` maps these three methods onto
 * the `weeklySession.*` channels and `sessionWriteGateway` swaps to it in one line.
 */
class MockSessionWriteGateway implements SessionWriteGateway {
  async create(input: SessionInput): Promise<{ id: string }> {
    void input;
    return { id: 'wrs_mock' };
  }

  async update(id: string, input: SessionInput): Promise<{ id: string }> {
    void input;
    return { id };
  }

  async cancel(id: string): Promise<void> {
    void id;
  }
}

export const mockSessionWriteGateway: SessionWriteGateway = new MockSessionWriteGateway();
