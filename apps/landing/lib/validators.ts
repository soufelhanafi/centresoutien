import { z } from "zod";

/** Student-count buckets shown in the founder form. */
export const STUDENT_RANGES = ["lt50", "50-150", "150-300", "gt300"] as const;
export type StudentRange = (typeof STUDENT_RANGES)[number];

// Moroccan phone: +212 or leading 0, then exactly 9 digits (spaces/dashes
// allowed only between digits — never counted toward the digit total).
const MOROCCAN_PHONE = /^(?:\+212|0)(?:[\s-]?\d){9}$/;

/** Single source of truth for the founder application, used client + server. */
export const founderApplicationSchema = z.object({
  centerName: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  studentsRange: z.enum(STUDENT_RANGES),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().regex(MOROCCAN_PHONE),
  consent: z.literal(true),
});

export type FounderApplication = z.infer<typeof founderApplicationSchema>;

/** Single source of truth for the download lead capture, used client + server. */
export const downloadLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  consent: z.literal(true),
});

export type DownloadLead = z.infer<typeof downloadLeadSchema>;
