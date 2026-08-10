---
name: shadcn-add-component
description: Add a new shadcn/ui component to the Centre Soutien Next.js repo the right way — via the CLI, without forking, without hand-writing, and integrated with the repo's design tokens and RTL setup. Use this skill any time a UI primitive is needed that isn't already in `components/ui/`. Trigger on phrases like "add a button", "need a dropdown", "add a dialog", "we need a tabs component", or any styling task that reaches for a primitive not currently installed. Also trigger when reviewing a diff that hand-writes a component that shadcn provides — the answer is almost always "use shadcn instead".
---

# shadcn Add-Component Skill

This repo uses shadcn/ui as the only component library. Adding a new primitive follows a strict procedure to keep the design tokens consistent, avoid drift, and keep RTL working.

**The most important rule: never hand-write a component that shadcn provides. Never fork one. Wrap them instead.**

---

## Step 1 — Confirm it's actually needed

Before installing, check:

- [ ] Is the primitive already installed? Check `components/ui/`:
  ```bash
  ls components/ui/
  ```
- [ ] Is there an existing component that could serve the purpose with a new variant? A `<Button variant="destructive">` beats installing an `<AlertButton />`.
- [ ] Is this actually a primitive, or a section-specific composition? If it's used in only one section and won't be reused, build it inline in that section's file — don't add it to `components/ui/`.

If the primitive genuinely doesn't exist and is needed, continue.

---

## Step 2 — Check the shadcn registry

Confirm the component exists and check its dependencies:
```bash
pnpm dlx shadcn@latest add --help
# or check the registry
open https://ui.shadcn.com/docs/components
```

Note:
- The component's name (canonical form used by the CLI)
- Any dependencies it pulls in (e.g., `dialog` requires `@radix-ui/react-dialog`)
- Whether it's a compound component (`Dialog`, `Tabs`) or a single component (`Button`)
- Whether it needs any Tailwind config additions

---

## Step 3 — Install via the CLI, never hand-copy

```bash
pnpm dlx shadcn@latest add <component-name>
```

Examples:
```bash
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add dialog
pnpm dlx shadcn@latest add form
```

The CLI will:
- Add the component file(s) to `components/ui/`
- Install any required Radix or utility packages
- Add any needed CSS variables to `app/globals.css` if missing

**Do not:**
- Copy-paste the source from the shadcn website into a hand-created file.
- Rename the exported components.
- Move the file out of `components/ui/`.

---

## Step 4 — Verify the install

- [ ] The new file(s) appear in `components/ui/`.
- [ ] `package.json` shows the new Radix/utility dependencies.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] No new CSS variables were added that conflict with existing ones.

If any check fails, revert:
```bash
git checkout -- .
```
Fix the issue and retry.

---

## Step 5 — Adapt for this repo's constraints

shadcn ships components with LTR-only assumptions in some places. Audit the newly installed file for:

- [ ] Directional Tailwind classes (`pl-`, `pr-`, `ml-`, `mr-`, `text-left`, `text-right`, `left-`, `right-`). If found, replace with logical properties (`ps-`, `pe-`, `ms-`, `me-`, `text-start`, `text-end`, `start-`, `end-`).
- [ ] Hardcoded English strings in aria-labels or sr-only text (`"Close"`, `"Open menu"`). Replace with `useTranslations()` calls or accept them as props.
- [ ] Hardcoded colors that don't use the CSS variables (`bg-white`, `text-black`). Replace with token variables (`bg-background`, `text-foreground`).
- [ ] `console.log` or debug leftovers.

Make these adjustments **once, at install time**. Do not treat them as ongoing maintenance.

---

## Step 6 — Extend via variants, never by forking

When a new visual style is needed:

**Right way — add a variant with `cva`:**
```tsx
// components/ui/button.tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center...',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        ghost: 'hover:bg-accent',
        destructive: 'bg-destructive text-destructive-foreground',
        // NEW variant added here
        download: 'bg-primary text-primary-foreground gap-2 shadow-lg',
      },
    },
  }
);
```

**Wrong way — copy the component into a new file:**
```tsx
// ❌ components/ui/download-button.tsx
export function DownloadButton({ children, ...props }) {
  return <button className="...">{children}</button>;
}
```

If the shadcn `variants` structure doesn't fit the need, wrap the component instead of forking it:

```tsx
// components/common/download-cta.tsx
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function DownloadCTA({ children }: { children: React.ReactNode }) {
  return (
    <Button variant="default" size="lg" className="gap-2">
      <Download className="size-4" aria-hidden />
      {children}
    </Button>
  );
}
```

The wrapper composes shadcn — it does not replace it.

---

## Step 7 — Use logical props in your wrapper

When wrapping shadcn components:

- Never spread arbitrary Tailwind classes that could conflict with logical properties.
- Use `cn()` from `lib/utils.ts` for conditional classes.
- Keep the wrapper's prop interface minimal — pass through only what's actually configurable.

Example of a minimal wrapper:
```tsx
type PricingCardProps = {
  tier: PricingTier;
  isRecommended?: boolean;
};

export function PricingCard({ tier, isRecommended }: PricingCardProps) {
  return (
    <Card className={cn('flex flex-col', isRecommended && 'ring-2 ring-primary scale-105')}>
      <CardHeader>...</CardHeader>
      <CardContent>...</CardContent>
      <CardFooter>
        <Button size="lg" className="w-full">{tier.ctaLabel}</Button>
      </CardFooter>
    </Card>
  );
}
```

---

## Step 8 — Document usage

If the new primitive requires non-obvious usage (compound components, portal considerations, etc.), add a short usage comment at the top of the file in `components/ui/`:

```tsx
// components/ui/dialog.tsx
/**
 * Usage:
 *   <Dialog>
 *     <DialogTrigger>...</DialogTrigger>
 *     <DialogContent>...</DialogContent>
 *   </Dialog>
 *
 * DialogContent portals to document.body — do not wrap in overflow-hidden containers.
 */
```

---

## Step 9 — Verify accessibility

shadcn primitives are built on Radix, which is accessible by default — but only if used correctly.

- [ ] Interactive elements are keyboard reachable (tab, shift-tab, enter, space, escape).
- [ ] Focus states are visible (`ring-2 ring-ring` on focus-visible).
- [ ] Screen reader labels present (`aria-label`, `aria-describedby`) where needed.
- [ ] Modals trap focus and return it on close.
- [ ] The component works in both `/fr/` and `/ar/`.

Test with keyboard only. Test with a screen reader (VoiceOver, NVDA) on the shipping page that uses it.

---

## Anti-patterns to reject on sight

- **Hand-writing a `<Button />`.** Always use shadcn's.
- **Forking a shadcn component to add a variant.** Add the variant to the existing `variants` object.
- **Renaming shadcn exports.** Import `Button`, not `MyButton`.
- **Moving `components/ui/` files elsewhere.** They belong there.
- **Installing a competing library** (Material, Chakra, Ant Design, daisyUI) alongside shadcn.
- **Reimplementing an existing shadcn component "because ours is slightly different".** Wrap or extend, don't reimplement.
- **Copy-pasting from Radix docs directly.** Always go through the shadcn CLI.

---

## When shadcn genuinely doesn't have what you need

Rare, but it happens. In that case:

1. Confirm by checking the shadcn registry and community registry.
2. Build the new primitive directly on Radix (the same base shadcn uses) with the same conventions:
   - File in `components/ui/`
   - `cva` for variants
   - CSS variables from `globals.css` for colors
   - Logical Tailwind properties for spacing
   - `React.forwardRef` if it accepts a `ref`
3. Follow the same accessibility standards Radix components meet.
4. Add a comment at the top of the file explaining why this is custom (not in shadcn).

But 95% of the time, the answer is "use shadcn's version".
