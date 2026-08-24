"use client";

// Gates the download cards behind the lead-capture form (SOU-312). Fetches the
// latest release up front so the cards render instantly once the form succeeds,
// then hands the release to the presentational DownloadCards.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLatestRelease } from "./use-latest-release";
import { DownloadCards } from "./download-cards";
import { DownloadLeadForm } from "./download-lead-form";

export function DownloadGate() {
  const t = useTranslations("download.lead");
  const { release, recommended } = useLatestRelease();
  const [unlocked, setUnlocked] = useState(false);

  if (unlocked) {
    return (
      <div>
        <p
          aria-live="polite"
          className="mb-5 text-sm font-semibold text-primary"
        >
          {t("success")}
        </p>
        <DownloadCards release={release} recommended={recommended} />
      </div>
    );
  }

  return <DownloadLeadForm onUnlocked={() => setUnlocked(true)} />;
}
