import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProblemCard = {
  icon: LucideIcon;
  title: string;
  body: string;
  tile: string;
};

export function ProblemCard({ icon: Icon, title, body, tile }: ProblemCard) {
  return (
    <article className="rounded-2xl border border-border bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-lg",
          tile,
        )}
      >
        <Icon className="size-[22px]" />
      </span>
      <h3 className="mt-4 text-[19px] font-bold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{body}</p>
    </article>
  );
}
