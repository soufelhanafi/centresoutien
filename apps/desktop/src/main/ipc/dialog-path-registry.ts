import { randomUUID } from 'node:crypto';

type DialogPathEntry = {
  path: string;
  issuedAt: number;
};

/** How long a dialog-issued token stays valid. Long enough to span a preview →
 *  apply flow (seconds), short enough that a stale token can't authorize a write
 *  to a path the user stopped thinking about. */
const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * One-time handle for a path the user picked in a native dialog (SOU-44, M3).
 * The renderer never sends a raw filesystem path to the backup channels — it
 * sends an opaque token that main issued from the dialog's own result, so a
 * compromised renderer cannot make the main process write to / read from an
 * arbitrary location. Entries expire after {@link MAX_AGE_MS}.
 */
export class DialogPathRegistry {
  private readonly entries = new Map<string, DialogPathEntry>();

  issue(path: string): string {
    this.evictExpired();
    const token = randomUUID();
    this.entries.set(token, { path, issuedAt: Date.now() });
    return token;
  }

  resolve(token: string | undefined): string | null {
    if (!token) return null;
    const entry = this.entries.get(token);
    if (entry === undefined) return null;
    if (Date.now() - entry.issuedAt > MAX_AGE_MS) {
      this.entries.delete(token);
      return null;
    }
    return entry.path;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [token, entry] of this.entries) {
      if (now - entry.issuedAt > MAX_AGE_MS) this.entries.delete(token);
    }
  }
}
