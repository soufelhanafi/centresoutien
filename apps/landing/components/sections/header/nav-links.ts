// Single source of the header nav order. Both the server-rendered desktop <nav>
// (header.tsx) and the client mobile island (mobile-nav.tsx) import this list so the
// links stay in sync. Labels resolve from next-intl by `key`. `hash` targets an
// in-page section on the home page; consumers render a locale-aware Link to
// `{ pathname: "/", hash }` so the anchor works from any subpage, not just home.
export const NAV_LINKS = [
  { key: "features", hash: "fonctionnalites" },
  { key: "founder", hash: "programme-fondateur" },
  { key: "faq", hash: "faq" },
  { key: "contact", hash: "contact" },
] as const;
