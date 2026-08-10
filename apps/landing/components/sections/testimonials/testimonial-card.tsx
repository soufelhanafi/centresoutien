import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type TestimonialCard = {
  quote: string;
  name: string;
  role: string;
  initials: string;
  gradient: string;
  ratingLabel: string;
};

export function TestimonialCard({
  quote,
  name,
  role,
  initials,
  gradient,
  ratingLabel,
}: TestimonialCard) {
  return (
    <article className="rounded-2xl border border-border bg-white p-7 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div
        role="img"
        aria-label={ratingLabel}
        className="flex items-center gap-0.5"
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            aria-hidden="true"
            className="size-4 fill-amber-500 text-amber-500"
          />
        ))}
      </div>
      <blockquote className="my-5 text-[17px] font-medium leading-[1.55] text-foreground">
        {quote}
      </blockquote>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white",
            gradient,
          )}
        >
          {initials}
        </span>
        <div>
          <div className="text-[14.5px] font-bold text-foreground">{name}</div>
          <div className="text-[13px] text-muted-foreground">{role}</div>
        </div>
      </div>
    </article>
  );
}
