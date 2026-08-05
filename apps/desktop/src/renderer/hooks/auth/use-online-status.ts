import { useSyncExternalStore } from 'react';

/**
 * Whether the device currently reports a network connection, tracked via the
 * browser `online`/`offline` events (SOU-156). This gates the email reset option
 * in the forgot-password flow: an offline center can only fall back to a recovery
 * code or its security questions, never the email relay.
 *
 * `navigator.onLine` reflects the OS network interface, not true reachability of
 * the relay — a machine on a LAN with no internet still reports `true`. That's an
 * accepted limitation here: the email path is a placeholder until the relay
 * (SOU-157) lands, and the real send will surface its own connectivity failure.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
