// Browser-agnostic OS family detection from a user-agent string. Deliberately
// conservative: browser UAs on Apple Silicon Macs commonly still report "Intel
// Mac OS X", so macOS architecture is NEVER inferred from the UA — the client
// component asks Chromium's UA Client Hints instead (see use-latest-release).
// Pure and unit-testable; used only by the download page.
import type { PlatformKey } from "./releases";

export type DetectedOs = "windows" | "mac" | "linux" | "other";

// Family-level guess of the visitor's platform. iOS UA strings contain
// "Mac OS X", so exclude iPhone/iPad/iPod first.
export function detectOs(userAgent: string): DetectedOs {
  const ua = userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  const onIos = ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");
  if (!onIos && (ua.includes("mac os") || ua.includes("macintosh"))) return "mac";
  if (ua.includes("linux")) return "linux";
  return "other";
}

// macOS architecture, only when the browser exposes UA Client Hints
// (Chromium/Edge). Returns null on non-Chromium or when hints are withheld.
// Falls back to the UA family detector: a non-mac UA yields null.
export type MacArch = "arm" | "x64" | null;

export async function detectMacArch(
  uaData: { getHighEntropyValues: (keys: string[]) => Promise<{ architecture?: string }> } | undefined,
): Promise<MacArch> {
  if (!uaData) return null;
  try {
    const { architecture } = await uaData.getHighEntropyValues(["architecture"]);
    if (architecture === "arm" || architecture === "x86") {
      return architecture === "arm" ? "arm" : "x64";
    }
    return null;
  } catch {
    return null;
  }
}

// Maps a detected OS family + Mac architecture to a download platform card.
// macOS is only recommended when the architecture is known via Client Hints —
// never guessed from the UA. Windows is always safe to recommend.
export function recommendPlatform(
  os: DetectedOs,
  macArch: MacArch,
): PlatformKey | null {
  if (os === "windows") return "windows";
  if (os === "mac") return macArch === "arm" ? "macAppleSilicon" : macArch === "x64" ? "macIntel" : null;
  return null;
}
