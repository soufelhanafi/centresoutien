"use client";

// Container for the changelog list. Owns the data fetch (useRecentReleases)
// and hands the result to the presentational ChangelogList.

import { useRecentReleases } from "./use-recent-releases";
import { ChangelogList } from "./changelog-list";

export function ChangelogSection() {
  const { releases, failed } = useRecentReleases();
  return <ChangelogList releases={releases} failed={failed} />;
}
