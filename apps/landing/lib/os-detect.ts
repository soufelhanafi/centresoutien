// Pure browser-agnostic OS detection from a user-agent string, so the
// recommendation logic is unit-testable. Used only by the download page.

export type DetectedOs = "mac-apple-silicon" | "mac-intel" | "windows" | "linux" | "other";

// Best-effort guess of the visitor's platform to pre-highlight a download card.
// Apple Silicon is the default for modern macOS since Intel Macs are legacy —
// the other cards remain one click away.
export function detectOs(userAgent: string): DetectedOs {
  const ua = userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  const onIos = ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");
  if (!onIos && (ua.includes("mac os") || ua.includes("macintosh"))) {
    const isArm =
      ua.includes("arm") || ua.includes("aarch64") || ua.includes("mac68k");
    return isArm ? "mac-apple-silicon" : "mac-intel";
  }
  if (ua.includes("linux")) return "linux";
  return "other";
}
