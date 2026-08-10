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
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
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
