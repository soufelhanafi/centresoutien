// Latest-release lookup against the public releases repo
// (soufelhanafi/centresoutien-releases). Runs in the BROWSER only (CORS is
// open on api.github.com): the landing build must never hit the network, so
// neither the download nor the changelog page fetch during static generation.
// On any failure the components fall back to the GitHub latest-release page,
// which redirects and never 404s.

const RELEASES_OWNER = "soufelhanafi";
const RELEASES_REPO = "centresoutien-releases";
const API_BASE = `https://api.github.com/repos/${RELEASES_OWNER}/${RELEASES_REPO}`;

// Stable URL that always redirects to the newest release — used as the
// fallback when the API is unreachable.
export const LATEST_RELEASE_PAGE_URL = `${API_BASE.replace(
  "api.github.com/repos",
  "github.com",
)}/releases/latest`;

export type ReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
};

export type ReleaseInfo = {
  tagName: string;
  version: string;
  publishedAt: string | null;
  body: string;
  assets: readonly ReleaseAsset[];
};

export type DownloadTargets = {
  macAppleSilicon?: ReleaseAsset;
  macIntel?: ReleaseAsset;
  windows?: ReleaseAsset;
};

// Pure mapping from release assets to the three platform targets. Asset names
// follow the electron-builder convention: `-arm64.dmg` = Apple Silicon,
// plain `.dmg` = Intel, `-Setup-*.exe` = Windows. `.blockmap` files are
// auto-update metadata, never direct downloads.
export function mapAssetsToTargets(
  assets: readonly ReleaseAsset[],
): DownloadTargets {
  const targets: DownloadTargets = {};
  for (const asset of assets) {
    if (asset.name.endsWith(".dmg")) {
      if (asset.name.includes("arm64")) {
        targets.macAppleSilicon ??= asset;
      } else {
        targets.macIntel ??= asset;
      }
    } else if (asset.name.endsWith(".exe")) {
      targets.windows ??= asset;
    }
  }
  return targets;
}

function parseVersion(tagName: string): string {
  return tagName.replace(/^v/, "");
}

function toReleaseInfo(json: Record<string, unknown>): ReleaseInfo {
  const assets = Array.isArray(json.assets)
    ? json.assets
        .filter(
          (a): a is Record<string, unknown> =>
            typeof a === "object" && a !== null,
        )
        .filter(
          (a) =>
            typeof a.name === "string" &&
            typeof a.browser_download_url === "string",
        )
        .map((a) => ({
          name: a.name as string,
          browserDownloadUrl: a.browser_download_url as string,
        }))
    : [];
  const tagName = typeof json.tag_name === "string" ? json.tag_name : "";
  return {
    tagName,
    version: parseVersion(tagName),
    publishedAt:
      typeof json.published_at === "string" ? json.published_at : null,
    body: typeof json.body === "string" ? json.body : "",
    assets,
  };
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    return toReleaseInfo((await res.json()) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function fetchRecentReleases(
  count: number,
): Promise<ReleaseInfo[]> {
  try {
    const res = await fetch(
      `${API_BASE}/releases?per_page=${count}&page=1`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as Record<string, unknown>[];
    return json.map(toReleaseInfo);
  } catch {
    return [];
  }
}
