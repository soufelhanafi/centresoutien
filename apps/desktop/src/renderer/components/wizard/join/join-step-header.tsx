import type { ReactNode } from 'react';

/**
 * Header for a join sub-step (SOU-318): a tinted icon tile, title, and one-line
 * description — mirrors `WizardShell`'s header without borrowing the domain step
 * metadata, since the join branch is renderer-only and not a domain step.
 */
export function JoinStepHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
