import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

type SavedLogoUrl = {
  /** Object URL for the saved logo, or null while loading / on error / missing. */
  url: string | null;
  isLoading: boolean;
};

/**
 * Re-hydrates an already-persisted center logo for display (SOU-28). The
 * renderer has no filesystem access, so it reads the stored bytes over the
 * typed IPC bridge (`center.logoBytes`) and wraps them in an object URL. The URL
 * is revoked whenever the bytes change or the caller unmounts, so no blob leaks.
 * Passing `null` disables the fetch (e.g. when a freshly picked file already
 * provides a live preview).
 */
export function useSavedLogoUrl(savedPath: string | null): SavedLogoUrl {
  const query = useQuery({
    queryKey: ['center.logoBytes', savedPath],
    enabled: savedPath !== null,
    queryFn: async () => {
      if (savedPath === null) return { bytes: null };
      return window.api.invoke('center.logoBytes', { path: savedPath });
    },
  });

  const bytes = query.data?.bytes ?? null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!bytes) {
      setUrl(null);
      return;
    }
    // Copy into a fresh ArrayBuffer-backed view: the IPC contract types the bytes
    // as the library-default `Uint8Array<ArrayBufferLike>`, which `Blob` won't take
    // directly (it requires an `ArrayBuffer` backing, not `SharedArrayBuffer`).
    const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes]);

  return { url, isLoading: savedPath !== null && query.isPending };
}
