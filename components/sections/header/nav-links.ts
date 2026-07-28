// Single source of the header nav order. Both the server-rendered desktop <nav>
// (header.tsx) and the client mobile island (mobile-nav.tsx) import this list so the
// links stay in sync. Labels resolve from next-intl by `key`; `href` targets the
// in-page section anchors.
export const NAV_LINKS = [
  { key: "features", href: "#fonctionnalites" },
  { key: "pricing", href: "#tarifs" },
  { key: "founder", href: "#programme-fondateur" },
  { key: "faq", href: "#faq" },
  { key: "contact", href: "#contact" },
] as const;
