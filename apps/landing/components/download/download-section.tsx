"use client";

// Container for the download hero. Owns the data fetch (useLatestRelease) and
// hands the result to the presentational DownloadCards.

import { useLatestRelease } from "./use-latest-release";
import { DownloadCards } from "./download-cards";

export function DownloadSection() {
  const { release, recommended } = useLatestRelease();
  return <DownloadCards release={release} recommended={recommended} />;
}
