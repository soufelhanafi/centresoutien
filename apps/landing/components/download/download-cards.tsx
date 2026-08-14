"use client";

// Download platform cards. Runs client-side: fetches the latest release from
// the public releases repo (CORS-open), maps assets to the three platforms,
// and renders a download button per platform with the visitor's OS pre-selected.
// Falls back to the GitHub latest-release page when the API is unreachable, so
// the buttons never 404.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Apple, Download, Monitor, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  fetchLatestRelease,
  LATEST_RELEASE_PAGE_URL,
  mapAssetsToTargets,
  type ReleaseInfo,
} from "@/lib/releases";
import { detectOs, type DetectedOs } from "@/lib/os-detect";

type PlatformKey = "macAppleSilicon" | "macIntel" | "windows";

const PLATFORM_ICONS: Record<PlatformKey, LucideIcon> = {
  macAppleSilicon: Apple,
  macIntel: Apple,
  windows: Monitor,
};

const DETECTED_TO_PLATFORM: Partial<Record<DetectedOs, PlatformKey>> = {
  "mac-apple-silicon": "macAppleSilicon",
  "mac-intel": "macIntel",
  windows: "windows",
};

export function DownloadCards() {
  const t = useTranslations("download.platforms");
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [detected, setDetected] = useState<PlatformKey | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchLatestRelease().then((info) => {
      if (mounted && info) setRelease(info);
    });
    const platform = DETECTED_TO_PLATFORM[detectOs(navigator.userAgent)];
    if (mounted && platform) {
      // Deferred so the recommended badge does not set state synchronously in
      // the effect body (react-hooks/set-state-in-effect).
      const id = window.setTimeout(() => {
        if (mounted) setDetected(platform);
      }, 0);
      return () => {
        mounted = false;
        window.clearTimeout(id);
      };
    }
    return () => {
      mounted = false;
    };
  }, []);

  const targets = release ? mapAssetsToTargets(release.assets) : {};
  const version = release?.version;
  // When the API is unreachable, every card falls back to the latest-release
  // page — a redirect target, never a 404.
  const fallbackUrl = LATEST_RELEASE_PAGE_URL;

  const platforms: ReadonlyArray<{
    key: PlatformKey;
    name: string;
    subtitle: string;
    url: string | undefined;
  }> = [
    {
      key: "macAppleSilicon",
      name: t("mac_apple_silicon.name"),
      subtitle: t("mac_apple_silicon.subtitle"),
      url: targets.macAppleSilicon?.browserDownloadUrl,
    },
    {
      key: "macIntel",
      name: t("mac_intel.name"),
      subtitle: t("mac_intel.subtitle"),
      url: targets.macIntel?.browserDownloadUrl,
    },
    {
      key: "windows",
      name: t("windows.name"),
      subtitle: t("windows.subtitle"),
      url: targets.windows?.browserDownloadUrl,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {platforms.map(({ key, name, subtitle, url }) => {
        const Icon = PLATFORM_ICONS[key];
        const isRecommended = key === detected;
        return (
          <a
            key={key}
            href={url ?? fallbackUrl}
            className={cn(
              "group relative flex flex-col gap-3 rounded-2xl border bg-card p-5 text-start transition-all",
              isRecommended
                ? "border-primary shadow-lg shadow-primary/15"
                : "border-border hover:border-primary/50 hover:shadow-md",
            )}
          >
            {isRecommended ? (
              <span className="absolute -top-2.5 start-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-primary-foreground rtl:translate-x-1/2">
                {t("recommended")}
              </span>
            ) : null}
            <Icon aria-hidden="true" className="size-8 text-primary" />
            <span>
              <span className="block font-bold text-foreground">{name}</span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">
                {subtitle}
              </span>
            </span>
            <span
              className={cn(
                buttonVariants({
                  variant: isRecommended ? "primary" : "outline",
                  size: "sm",
                  className: "w-full",
                }),
              )}
            >
              <Download aria-hidden="true" />
              {t("download")}
            </span>
            {version ? (
              <span className="text-[11px] text-muted-foreground">
                {t("version_label", { version })}
              </span>
            ) : null}
          </a>
        );
      })}
    </div>
  );
}
