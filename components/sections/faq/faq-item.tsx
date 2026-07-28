import { ChevronDown } from "lucide-react";

type FaqItemProps = {
  question: string;
  answer: string;
  defaultOpen?: boolean;
};

export function FaqItem({ question, answer, defaultOpen = false }: FaqItemProps) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border bg-white px-5 py-[18px]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        {question}
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-primary transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-3 text-[15px] text-slate-600">{answer}</div>
    </details>
  );
}
