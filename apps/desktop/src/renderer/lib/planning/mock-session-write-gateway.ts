import type { SessionInput } from './session-form-schema';
import type { SessionWriteGateway } from './session-write-gateway';

/**
 * Test-only {@link SessionWriteGateway}. Production uses {@link ipcSessionWriteGateway}
 * over the real `weeklySession.*` channels; this mock accepts every write (no
 * persistence) so the create/edit form flows are exercisable in unit tests without
 * Electron. Inline conflict handling is proven by rejecting a mutation with an
 * `Error` whose message carries a domain error class name (which
 * `mapSessionWriteError` matches), not from here.
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
