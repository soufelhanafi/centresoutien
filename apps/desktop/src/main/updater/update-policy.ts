// How the updater may behave on this build. `enabled` gates running the
// updater at all; `canApply` gates auto-download + quitAndInstall. macOS is
// check-only until a Developer ID signing ticket lands, because Squirrel.Mac
// refuses to apply unsigned updates.
export type UpdaterCapability = {
  enabled: boolean;
  canApply: boolean;
};

const DISABLED: UpdaterCapability = { enabled: false, canApply: false };

export function resolveUpdaterCapability(input: {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  isMacSigned: boolean;
}): UpdaterCapability {
  if (!input.isPackaged) {
    return DISABLED;
  }
  if (input.platform === 'win32') {
    return { enabled: true, canApply: true };
  }
  if (input.platform === 'darwin') {
    return { enabled: true, canApply: input.isMacSigned };
  }
  return DISABLED;
}

export function isCheckDue(input: {
  lastCheckAt: number | null;
  now: number;
  intervalMs: number;
}): boolean {
  if (input.lastCheckAt === null) {
    return true;
  }
  return input.now - input.lastCheckAt >= input.intervalMs;
}

export const UPDATE_CHECK_INTERVAL_MS = 21_600_000;
export const UPDATE_FIRST_CHECK_DELAY_MS = 10_000;
