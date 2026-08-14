import { useEffect } from 'react';
import { toast } from '@centresoutien/ui';
import type { UpdateStatusEvent } from '../../shared/ipc/update-events';
import { UpdateCard } from '../components/update-card';

const UPDATE_TOAST_ID = 'app-update-ready';
const SKIPPED_VERSION_KEY = 'skippedUpdateVersion';

// localStorage can throw (disabled, private mode, quota). The skip preference is
// a convenience, never a correctness guarantee — a throwing store must degrade to
// "always show the card", never swallow the update prompt.
function readSkippedVersion(): string | null {
  try {
    return localStorage.getItem(SKIPPED_VERSION_KEY);
  } catch {
    return null;
  }
}

function persistSkippedVersion(version: string): void {
  try {
    localStorage.setItem(SKIPPED_VERSION_KEY, version);
  } catch {
    // Skip is best-effort; a failed write just means the card reappears next time.
  }
}

// SOU-254: surfaces a downloaded update as a WhatsApp-style non-blocking,
// dismissible card offering Install now / Later / Skip this version. Only the
// `downloaded` state is user-facing — checking/downloading are silent by
// design. On Windows the restart applies the update; on unsigned macOS the
// download never completes, so this card simply never appears there.
export function useAppUpdate(): void {
  useEffect(() => {
    const dispose = window.api.onUpdateStatus((event: UpdateStatusEvent) => {
      if (event.state !== 'downloaded') {
        return;
      }
      // Exact-version equality: a skipped version stays hidden, but any newer
      // version differs from the stored string and naturally passes the guard.
      if (event.version === readSkippedVersion()) {
        return;
      }
      const dismiss = (): void => {
        toast.dismiss(UPDATE_TOAST_ID);
      };
      toast.custom(
        () => (
          <UpdateCard
            version={event.version}
            onInstallNow={() => window.api.restartNow()}
            onLater={dismiss}
            onSkip={() => {
              persistSkippedVersion(event.version);
              dismiss();
            }}
          />
        ),
        {
          id: UPDATE_TOAST_ID,
          duration: Infinity,
        },
      );
    });
    return dispose;
  }, []);
}
