# Mobile Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give sub-`md` visitors an accessible hamburger menu exposing the five section anchors, the Télécharger CTA, and the FR/ع language toggle.

**Architecture:** `Header` stays a Server Component. One new `'use client'` island, `MobileNav`, renders the hamburger trigger plus a full-width dropdown panel (over a scrim) that appears directly under the sticky header. The nav order is extracted to a shared `nav-links.ts` so the server desktop `<nav>` and the client island share one source. The disclosure is hand-rolled (no Radix) with Escape/scrim/link/breakpoint close, focus management, body-scroll lock, and a reduced-motion-gated entrance animation.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, next-intl v4, lucide-react.

## Global Constraints

- **No automated tests in this repo** (CLAUDE.md §11). Per-task verification is `pnpm lint` (0 warnings), `pnpm typecheck`, `pnpm build`, plus a manual FR + AR browser smoke. There is no test runner — do not create test files.
- **Package manager is pnpm.** Never npm/yarn.
- **No hardcoded user-facing strings** — every label resolves through next-intl. New keys go in **both** `i18n/messages/fr.json` and `i18n/messages/ar.json`, French first.
- **Logical Tailwind props only** — `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`/`text-end`, `inset-x-*`, `start-*`/`end-*`. Never `pl-*`, `pr-*`, `ml-*`, `mr-*`, `text-left`, `text-right`.
- **Server Components by default.** Only `MobileNav` gets `'use client'`; justify it (needs `useState`/effects/browser APIs).
- **Use `cn()`** from `lib/utils.ts` for conditional classes; never string-concatenate Tailwind classes.
- **Initial JS budget < 90 kb gzipped** — no new dependency; hand-roll the disclosure.
- Design tokens in use: `bg-background`, `border-border`, `bg-muted`, `text-foreground`, `text-primary`, `bg-primary`, plus default Tailwind `slate-*`. The Arabic font utility is `font-arabic`.
- Commit messages: **subject line only**, Conventional Commits, no body, no trailers.

---

### Task 1: Shared nav-links module, header import, and i18n keys

Foundation with **zero visual change**: extract the nav order to its own module, point the header at it, and add the two new a11y strings that `MobileNav` will consume in Task 2.

**Files:**
- Create: `components/sections/header/nav-links.ts`
- Modify: `components/sections/header/header.tsx` (remove inline `NAV_LINKS`, import it)
- Modify: `i18n/messages/fr.json` (add `header.menu`)
- Modify: `i18n/messages/ar.json` (add `header.menu`)

**Interfaces:**
- Produces: `NAV_LINKS: readonly { readonly key: string; readonly href: string }[]` from `components/sections/header/nav-links.ts`. Values, in order: `{key:"features",href:"#fonctionnalites"}`, `{key:"pricing",href:"#tarifs"}`, `{key:"founder",href:"#programme-fondateur"}`, `{key:"faq",href:"#faq"}`, `{key:"contact",href:"#contact"}`.
- Produces: message keys `header.menu.open` and `header.menu.close` in both locales.

- [ ] **Step 1: Create the shared nav-links module**

Create `components/sections/header/nav-links.ts`:

```ts
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
```

- [ ] **Step 2: Point the header at the shared module**

In `components/sections/header/header.tsx`, delete the inline `NAV_LINKS` declaration (the `const NAV_LINKS = [...] as const;` block and its two comment lines above it) and add an import. The top of the file becomes:

```tsx
import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "./nav-links";
import { LanguageToggle } from "./language-toggle";

export async function Header() {
  const t = await getTranslations("header");
```

Leave the rest of the component (the JSX) unchanged in this task.

- [ ] **Step 3: Add the menu a11y strings to French**

In `i18n/messages/fr.json`, inside the `header` object, add a `menu` block between `cta` and `language`. Replace:

```json
  "cta": {
    "download": "Télécharger"
  },
  "language": {
```

with:

```json
  "cta": {
    "download": "Télécharger"
  },
  "menu": {
    "open": "Ouvrir le menu",
    "close": "Fermer le menu"
  },
  "language": {
```

- [ ] **Step 4: Add the menu a11y strings to Arabic**

In `i18n/messages/ar.json`, inside the `header` object, replace:

```json
  "cta": {
    "download": "تحميل"
  },
  "language": {
```

with:

```json
  "cta": {
    "download": "تحميل"
  },
  "menu": {
    "open": "فتح القائمة",
    "close": "إغلاق القائمة"
  },
  "language": {
```

- [ ] **Step 5: Verify — refactor is behavior-neutral and builds**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all pass, 0 lint warnings. The header renders exactly as before (desktop nav unchanged); the new `menu` keys are present but not yet consumed.

Also confirm the JSON is valid and keys landed:

Run: `node -e "const f=require('./i18n/messages/fr.json'),a=require('./i18n/messages/ar.json');console.log(f.header.menu.open, '|', a.header.menu.close)"`
Expected: `Ouvrir le menu | إغلاق القائمة`

- [ ] **Step 6: Commit**

```bash
git add components/sections/header/nav-links.ts components/sections/header/header.tsx i18n/messages/fr.json i18n/messages/ar.json
git commit -m "refactor: extract header nav-links and add mobile menu i18n keys"
```

---

### Task 2: MobileNav island, motion tokens, and header wiring

Build the complete hamburger disclosure and wire it into the header: below `md` the header shows logo + hamburger; the desktop nav and CTA/toggle cluster become `md`-and-up only.

**Files:**
- Modify: `app/globals.css` (add the reduced-motion-gated entrance keyframes)
- Create: `components/sections/header/mobile-nav.tsx` (`'use client'`)
- Modify: `components/sections/header/header.tsx` (gate desktop cluster behind `md`, render `<MobileNav />`)

**Interfaces:**
- Consumes: `NAV_LINKS` from `./nav-links`; `Button` from `@/components/ui/button` (forwards `className`, `onClick`, and all button attrs; `variant="primary"`, `size="sm"`); `LanguageToggle` from `./language-toggle`; `cn` from `@/lib/utils`; message keys `header.nav.*`, `header.cta.download`, `header.menu.open`, `header.menu.close`, `header.nav_aria`.
- Produces: default-free named export `MobileNav` (no props) from `components/sections/header/mobile-nav.tsx`.

- [ ] **Step 1: Add the entrance motion utilities to globals.css**

Append to the end of `app/globals.css` (there are no existing keyframes; `tailwindcss-animate` is not installed, so the animation is plain CSS):

```css
/* Mobile nav dropdown — short entrance, disabled under reduced-motion. */
@keyframes mobile-nav-panel-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes mobile-nav-scrim-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.mobile-nav-panel {
  animation: mobile-nav-panel-in 150ms ease-out;
}

.mobile-nav-scrim {
  animation: mobile-nav-scrim-in 150ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .mobile-nav-panel,
  .mobile-nav-scrim {
    animation: none;
  }
}
```

- [ ] **Step 2: Create the MobileNav client island**

Create `components/sections/header/mobile-nav.tsx`:

```tsx
"use client";

// Client island: the sub-`md` disclosure menu. Below `md` the header shows only the
// logo + this hamburger; the nav links, download CTA, and language toggle live in the
// dropdown panel it toggles. `'use client'` is required — it owns open/close state,
// keyboard + focus effects, a matchMedia listener, and body-scroll locking. Hand-rolled
// (no Radix) to stay within the initial-JS budget and match the repo's hand-authored
// primitives. The panel is `absolute top-full`, resolving to the sticky <header> box, so
// it spans the full header width with no portal and no backdrop-filter clipping.
import { useEffect, useRef, useState } from "react";
import { Download, Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "./nav-links";
import { LanguageToggle } from "./language-toggle";

const PANEL_ID = "mobile-nav-panel";

export function MobileNav() {
  const t = useTranslations("header");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape (regardless of focus) and when the viewport reaches `md`.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 768px)");
    const onBreakpointChange = () => {
      if (desktop.matches) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onBreakpointChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onBreakpointChange);
    };
  }, [open]);

  // Lock body scroll while open; focus the first panel item on open and restore focus
  // to the trigger on close.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  // Keep Tab focus within the open menu (trigger + panel controls).
  const onContainerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open || event.key !== "Tab") return;
    const focusables = containerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={onContainerKeyDown}
      className="ms-auto md:hidden"
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={open ? t("menu.close") : t("menu.open")}
        className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="mobile-nav-scrim absolute inset-x-0 top-full z-40 h-screen bg-slate-900/40"
          />
          <div
            ref={panelRef}
            id={PANEL_ID}
            className="mobile-nav-panel absolute inset-x-0 top-full z-50 border-b border-border bg-background shadow-lg"
          >
            <div className="mx-auto max-w-[1200px] px-8 py-4">
              <nav aria-label={t("nav_aria")} className="flex flex-col">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center text-[15px] font-medium text-slate-700 transition-colors hover:text-primary"
                  >
                    {t(`nav.${link.key}`)}
                  </a>
                ))}
              </nav>
              <div className="mt-3 flex flex-col gap-3 border-t border-border pt-4">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => setOpen(false)}
                >
                  <Download aria-hidden="true" />
                  {t("cta.download")}
                </Button>
                <LanguageToggle />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire MobileNav into the header and gate the desktop cluster**

In `components/sections/header/header.tsx`, add the import and update the JSX. Add to the imports:

```tsx
import { MobileNav } from "./mobile-nav";
```

Then change the CTA/toggle cluster so it only shows at `md+`, and render `<MobileNav />` as the sub-`md` counterpart. Replace this block:

```tsx
        <div className="flex items-center gap-2.5 ms-auto md:ms-0">
          <LanguageToggle />
          <Button variant="primary" size="sm">
            <Download aria-hidden="true" />
            {t("cta.download")}
          </Button>
        </div>
```

with:

```tsx
        <div className="hidden items-center gap-2.5 md:flex">
          <LanguageToggle />
          <Button variant="primary" size="sm">
            <Download aria-hidden="true" />
            {t("cta.download")}
          </Button>
        </div>

        <MobileNav />
```

(The desktop `<nav>` already carries `hidden ... md:flex`, so no change there. On mobile only the logo and `<MobileNav />` remain; `MobileNav`'s own wrapper carries `ms-auto md:hidden` to sit at the end edge.)

- [ ] **Step 4: Verify — lint, types, build**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: all pass, 0 lint warnings.

- [ ] **Step 5: Manual smoke — French, mobile width**

Run: `pnpm dev`, open `http://localhost:3000/fr` at ~390px width (DevTools device toolbar). Verify:
- Header shows logo + hamburger only; desktop nav and CTA/toggle cluster are hidden.
- Tap hamburger → panel drops under the header over a dimmed scrim; icon becomes X; `aria-expanded="true"`.
- The five links, the Télécharger CTA, and the FR/ع toggle are all present and full-width.
- Tapping a link closes the panel and jumps to the section anchor; tapping the scrim closes it; the CTA closes it.
- Keyboard: `Tab` cycles within trigger + panel controls only; `Escape` closes and returns focus to the hamburger.
- Resize to ≥ 768px while open → panel closes and the desktop nav + cluster reappear.
- With OS "reduce motion" on, the panel appears with no slide/fade.

- [ ] **Step 6: Manual smoke — Arabic / RTL**

Open `http://localhost:3000/ar` at ~390px. Verify:
- Hamburger sits at the **end (left)** edge under `dir="rtl"`; panel is full-width and reads right-to-left.
- Arabic labels render (الميزات، الأسعار، …), the toggle shows ع active, and all close paths from Step 5 behave identically.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/sections/header/mobile-nav.tsx components/sections/header/header.tsx
git commit -m "feat: add accessible mobile navigation menu to header"
```

- [ ] **Step 8: Push the branch**

```bash
git push -u origin feat/mobile-nav
```

Then the reviewer opens the PR.

---

## Self-Review

**Spec coverage:**
- Component boundary (Header stays server, one client island) → Task 2. ✓
- Shared `nav-links.ts` → Task 1. ✓
- Header row composition (logo + hamburger < md; nav + cluster ≥ md) → Task 2 Step 3. ✓
- Trigger with `aria-expanded`/`aria-controls`, Menu⇄X icon → Task 2 Step 2. ✓
- Panel contents (5 links, divider, CTA, toggle) → Task 2 Step 2. ✓
- Close on link/CTA/scrim/Escape/`md` → Task 2 Step 2 (effects + onClick). ✓
- Focus move in/out, focus containment, scroll lock → Task 2 Step 2 (two effects + `onContainerKeyDown`). ✓
- Reduced-motion-gated motion → Task 2 Step 1 (globals keyframes + media query). ✓
- RTL logical props / end-edge hamburger → `ms-auto`, `inset-x-0`, full-width panel; verified Task 2 Step 6. ✓
- New i18n keys in FR + AR → Task 1 Steps 3–4. ✓
- Verification (lint/typecheck/build + FR/AR smoke) → Task 2 Steps 4–6. ✓
- No new dependency / hand-rolled → Task 2 (no install). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; all code shown in full. ✓

**Type consistency:** `NAV_LINKS` shape identical across `nav-links.ts`, `header.tsx`, `mobile-nav.tsx`; `PANEL_ID` matches `aria-controls`/`id`; `Button` `variant`/`size`/`className`/`onClick` match its real signature; message keys match the JSON added in Task 1. ✓
