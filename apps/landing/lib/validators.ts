import { z } from "zod";

/** Student-count buckets shown in the founder form. */
export const STUDENT_RANGES = ["lt50", "50-150", "150-300", "gt300"] as const;
export type StudentRange = (typeof STUDENT_RANGES)[number];

// Moroccan phone: +212 or leading 0, then digits/spaces/dashes (>= 9 more chars).
const MOROCCAN_PHONE = /^(?:\+212|0)[\d\s-]{9,}$/;

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
