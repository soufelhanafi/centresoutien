import { ImageResponse } from "next/og";

// Branded favicon, generated at build time with the same CS mark as /logo.png
// (SOU-211). Replaces the generic favicon.ico. 64px keeps the mark crisp on
// HiDPI displays while staying tiny.
export const dynamic = "force-static";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "14px",
          background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: "28px",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            color: "#ffffff",
          }}
        >
          CS
        </div>
      </div>
    ),
    size,
  );
}
