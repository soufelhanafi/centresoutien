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
import { cn } from "@/lib/utils";
import { STUDENT_RANGES } from "@/lib/validators";
import {
  submitFounderApplication,
  type FounderFormState,
} from "./submit-application";

const initialState: FounderFormState = { status: "idle" };
const fieldClass =
  "border-white/15 bg-slate-950/40 text-white placeholder:text-slate-500 focus-visible:ring-offset-slate-900";

export function FounderForm() {
  const t = useTranslations("founder.form");
  const [state, formAction, pending] = useActionState(
    submitFounderApplication,
    initialState,
  );
  const [consent, setConsent] = useState(false);
  const seen = useRef<FounderFormState>(initialState);
  const id = {
    center: useId(),
    city: useId(),
    students: useId(),
    email: useId(),
    phone: useId(),
    consent: useId(),
  };

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.status === "success") toast.success(t("toast_success"));
    else if (state.status === "error") {
      toast.error(
        state.error === "validation_failed"
          ? t("toast_validation")
          : t("toast_error"),
      );
    }
  }, [state, t]);

  if (state.status === "success") {
    return (
      <div
        aria-live="polite"
        className="rounded-2xl border border-white/10 bg-white/5 p-7 text-center"
      >
        <p className="text-lg font-bold text-white">{t("success_title")}</p>
        <p className="mt-2 text-sm text-slate-300">{t("success_body")}</p>
      </div>
    );
  }

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const err = (name: string) => (errors[name] ? t(`errors.${name}`) : undefined);

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-white/10 bg-white/5 p-7"
    >
      <p className="text-lg font-bold text-white">{t("title")}</p>
      <p className="mb-5 mt-1 text-[13px] text-slate-400">{t("subtitle")}</p>

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
        <Field id={id.center} label={t("fields.center.label")} error={err("centerName")}>
          <Input
            id={id.center}
            name="centerName"
            required
            aria-required="true"
            aria-invalid={Boolean(err("centerName"))}
            aria-describedby={err("centerName") ? `${id.center}-err` : undefined}
            placeholder={t("fields.center.placeholder")}
            className={fieldClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field id={id.city} label={t("fields.city.label")} error={err("city")}>
            <Input
              id={id.city}
              name="city"
              required
              aria-required="true"
              aria-invalid={Boolean(err("city"))}
              aria-describedby={err("city") ? `${id.city}-err` : undefined}
              placeholder={t("fields.city.placeholder")}
              className={fieldClass}
            />
          </Field>
          <Field
            id={id.students}
            label={t("fields.students.label")}
            error={err("studentsRange")}
          >
            <select
              id={id.students}
              name="studentsRange"
              required
              defaultValue=""
              aria-required="true"
              aria-invalid={Boolean(err("studentsRange"))}
              aria-describedby={
                err("studentsRange") ? `${id.students}-err` : undefined
              }
              className={cn(
                "flex h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                fieldClass,
              )}
            >
              <option value="" disabled>
                {t("fields.students.placeholder")}
              </option>
              {STUDENT_RANGES.map((r) => (
                <option key={r} value={r} className="text-slate-900">
                  {t(`fields.students.options.${r}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field id={id.email} label={t("fields.email.label")} error={err("email")}>
          <Input
            id={id.email}
            type="email"
            name="email"
            required
            aria-required="true"
            aria-invalid={Boolean(err("email"))}
            aria-describedby={err("email") ? `${id.email}-err` : undefined}
            placeholder={t("fields.email.placeholder")}
            className={fieldClass}
          />
        </Field>

        <Field id={id.phone} label={t("fields.phone.label")} error={err("phone")}>
          <Input
            id={id.phone}
            type="tel"
            name="phone"
            required
            dir="ltr"
            aria-required="true"
            aria-invalid={Boolean(err("phone"))}
            aria-describedby={err("phone") ? `${id.phone}-err` : undefined}
            placeholder="+212 6 12 34 56 78"
            className={fieldClass}
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
            className="text-[12.5px] font-normal leading-relaxed text-slate-300"
          >
            {t.rich("consent", {
              link: (chunks) => (
                <Link href="/confidentialite" className="text-teal-300 underline">
                  {chunks}
                </Link>
              ),
            })}
          </Label>
        </div>
        {err("consent") ? (
          <p id={`${id.consent}-err`} className="text-xs text-red-300">
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
      <Label htmlFor={id} className="mb-1.5 text-xs text-slate-300">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
