import { ImageResponse } from "next/og";

// Branded logo asset for schema.org Organization.logo and any consumer that
// needs the CS mark as a real image (replaces the old favicon.ico reference in
// structured-data.ts, SOU-211). Rendered at build time via Satori — self-
// contained, no remote assets. 512px is comfortably above the ~112px minimum
// that Google's logo rich-result guidance requires.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "112px",
          background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: "220px",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            color: "#ffffff",
          }}
        >
          CS
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
