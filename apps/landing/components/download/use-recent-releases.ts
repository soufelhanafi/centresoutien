"use client";

// Data-fetching hook for the changelog page. Distinguishes "failed" (null) from
// "no releases yet" ([]), so the UI can render the right state.

import { useEffect, useState } from "react";
import { fetchRecentReleases, type ReleaseInfo } from "@/lib/releases";

const MAX_RELEASES = 10;

export type RecentReleasesState = {
  releases: ReleaseInfo[] | null;
  failed: boolean;
};

export function useRecentReleases(): RecentReleasesState {
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchRecentReleases(MAX_RELEASES).then((list) => {
      if (!mounted) return;
      if (list === null) {
        setFailed(true);
      } else {
        setReleases(list);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { releases, failed };
}
