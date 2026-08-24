"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  submitDownloadLead,
  type DownloadLeadState,
} from "./submit-download-lead";

const initialState: DownloadLeadState = { status: "idle" };

export function DownloadLeadForm({ onUnlocked }: { onUnlocked: () => void }) {
  const t = useTranslations("download.lead");
  const [state, formAction, pending] = useActionState(
    submitDownloadLead,
    initialState,
  );
  const [consent, setConsent] = useState(false);
  const seen = useRef<DownloadLeadState>(initialState);
  const id = {
    name: useId(),
    email: useId(),
    consent: useId(),
  };

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.status === "success") {
      onUnlocked();
    } else if (state.status === "error") {
      toast.error(
        state.error === "validation_failed"
          ? t("toast_validation")
          : t("toast_error"),
      );
    }
  }, [state, onUnlocked, t]);

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const err = (name: string) => (errors[name] ? t(`errors.${name}`) : undefined);

  return (
    <form action={formAction} className="rounded-2xl border border-border bg-card p-7 text-start">
      <p className="text-lg font-bold text-foreground">{t("title")}</p>
      <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
        {t("subtitle")}
      </p>

      {/* Honeypot — visually hidden, off the a11y tree. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute -z-10 size-0 opacity-0"
      />

      <div className="flex flex-col gap-3.5">
        <Field id={id.name} label={t("fields.name.label")} error={err("name")}>
          <Input
            id={id.name}
            name="name"
            required
            aria-required="true"
            aria-invalid={Boolean(err("name"))}
            aria-describedby={err("name") ? `${id.name}-err` : undefined}
            placeholder={t("fields.name.placeholder")}
          />
        </Field>

        <Field id={id.email} label={t("fields.email.label")} error={err("email")}>
          <Input
            id={id.email}
            type="email"
            name="email"
            required
            dir="ltr"
            aria-required="true"
            aria-invalid={Boolean(err("email"))}
            aria-describedby={err("email") ? `${id.email}-err` : undefined}
            placeholder={t("fields.email.placeholder")}
          />
        </Field>

        <div className="mt-1 flex gap-2.5">
          <Checkbox
            id={id.consent}
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-required="true"
            aria-describedby={err("consent") ? `${id.consent}-err` : undefined}
            className="mt-0.5"
          />
          <Label
            htmlFor={id.consent}
            className="text-[12.5px] font-normal leading-relaxed text-muted-foreground"
          >
            {t.rich("consent", {
              link: (chunks) => (
                <Link href="/confidentialite" className="text-primary underline">
                  {chunks}
                </Link>
              ),
            })}
          </Label>
        </div>
        {err("consent") ? (
          <p id={`${id.consent}-err`} className="text-xs text-red-500">
            {err("consent")}
          </p>
        ) : null}

        <Button type="submit" disabled={!consent || pending} className="mt-2">
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
