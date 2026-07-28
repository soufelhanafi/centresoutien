import type { ReactNode } from "react";

type StepCardProps = {
  number: string;
  title: string;
  body: ReactNode;
};

export function StepCard({ number, title, body }: StepCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-white p-7">
      <div
        aria-hidden="true"
        className="text-[56px] font-extrabold leading-none tracking-[-0.03em] text-teal-100"
      >
        <span dir="ltr">{number}</span>
      </div>
      <h3 className="mb-2 mt-3 text-xl font-bold text-foreground">{title}</h3>
      <p className="text-[15px] leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}
