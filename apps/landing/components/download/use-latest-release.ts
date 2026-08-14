"use client";

// Data-fetching hook for the download page: latest release + recommended
// platform. Kept separate from the presentational card grid so the component
// stays deterministic and testable. The GitHub API is CORS-open, so this runs
// entirely in the browser — never at build time.

import { useEffect, useState } from "react";
import { fetchLatestRelease, type PlatformKey, type ReleaseInfo } from "@/lib/releases";
import { detectMacArch, detectOs, recommendPlatform } from "@/lib/os-detect";

export type LatestReleaseState = {
  release: ReleaseInfo | null;
  recommended: PlatformKey | null;
};

export function useLatestRelease(): LatestReleaseState {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [recommended, setRecommended] = useState<PlatformKey | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchLatestRelease().then((info) => {
      if (mounted && info) setRelease(info);
    });
    // Architecture is only trustworthy via UA Client Hints (Chromium); other
    // browsers get no macOS recommendation rather than a wrong guess.
    // `navigator.userAgentData` is absent from the TS DOM lib, so access it
    // via a narrow structural cast (absent → undefined → null arch).
    const navWithHints = navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues: (
          keys: string[],
        ) => Promise<{ architecture?: string }>;
      };
    };
    detectMacArch(navWithHints.userAgentData).then((arch) => {
      if (!mounted) return;
      const platform = recommendPlatform(detectOs(navigator.userAgent), arch);
      if (platform) setRecommended(platform);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { release, recommended };
}
