import { useCallback, useEffect, useRef, useState } from 'react';
import type { SyncProgressEvent } from '../../../shared/ipc/sync-events';

/** The renderer-facing progress snapshot: raw counts plus derived signals. */
export type SyncProgress = {
  readonly pulled: number;
  readonly total: number;
  /** Completion fraction clamped to 0..1. */
  readonly ratio: number;
  /** Wall-clock estimate of seconds left, or `null` until there is enough signal. */
  readonly etaSeconds: number | null;
};

export type UseSyncProgress = {
  readonly progress: SyncProgress | null;
  /** Clears the snapshot and the ETA anchor; the page calls it when it kicks off a run. */
  readonly reset: () => void;
};

/**
 * Subscribes to live chunked sync progress (SOU-330) and derives an ETA from
 * wall-clock throughput measured since the first tick of the run. Timestamps here
 * are renderer-local display math, never domain time — they only inform the user.
 */
export function useSyncProgress(): UseSyncProgress {
  const [event, setEvent] = useState<SyncProgressEvent | null>(null);
  const anchorRef = useRef<{ atMs: number } | null>(null);

  useEffect(() => {
    return window.api.onSyncProgress((next) => {
      anchorRef.current ??= { atMs: Date.now() };
      setEvent(next);
    });
  }, []);

  const reset = useCallback(() => {
    anchorRef.current = null;
    setEvent(null);
  }, []);

  const progress = event === null ? null : deriveProgress(event, anchorRef.current);

  return { progress, reset };
}

function deriveProgress(
  event: SyncProgressEvent,
  anchor: { atMs: number } | null,
): SyncProgress {
  const ratio = event.total > 0 ? Math.min(1, event.pulled / event.total) : 0;
  return {
    pulled: event.pulled,
    total: event.total,
    ratio,
    etaSeconds: estimateEtaSeconds(event, anchor),
  };
}

function estimateEtaSeconds(
  event: SyncProgressEvent,
  anchor: { atMs: number } | null,
): number | null {
  if (anchor === null) return null;
  const remaining = event.total - event.pulled;
  if (remaining <= 0) return 0;
  const elapsedSeconds = (Date.now() - anchor.atMs) / 1000;
  if (elapsedSeconds <= 0 || event.pulled <= 0) return null;
  return (elapsedSeconds / event.pulled) * remaining;
}
