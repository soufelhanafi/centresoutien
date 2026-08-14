"use client";

// Changelog list. Fetches recent releases from the public releases repo and
// renders version + date per release. Falls back to the GitHub releases page
// when the API is unreachable (never a 404).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import {
  fetchRecentReleases,
  LATEST_RELEASE_PAGE_URL,
  type ReleaseInfo,
} from "@/lib/releases";

const MAX_RELEASES = 10;

// Compact YYYY-MM-DD from an ISO UTC timestamp, for the published date.
function toDate(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function ChangelogList() {
  const t = useTranslations("changelog");
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchRecentReleases(MAX_RELEASES).then((list) => {
      if (!mounted) return;
      if (list.length === 0) {
        setFailed(true);
      } else {
        setReleases(list);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("fetch_error")}{" "}
        <a
          href={LATEST_RELEASE_PAGE_URL}
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        >
          {t("view_on_github")}
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </a>
      </p>
    );
  }

  if (!releases) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (releases.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ol className="flex flex-col gap-6">
      {releases.map((release, index) => {
        const date = toDate(release.publishedAt);
        return (
          <li
            key={release.tagName}
            className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-lg font-bold text-foreground">
                {t("version_label", { version: release.version })}
              </h3>
              {index === 0 ? (
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  {t("latest_badge")}
                </span>
              ) : null}
              <span className="text-[12px] text-muted-foreground">
                {release.tagName}
              </span>
            </div>
            {date ? (
              <p className="text-[12px] font-medium text-muted-foreground">
                {t("published_on", { date })}
              </p>
            ) : null}
            {release.body ? (
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-600">
                {release.body}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
