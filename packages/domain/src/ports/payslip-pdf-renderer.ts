import type { TeacherPayoutStatus } from '../entities/teacher-payout';
import type { TeacherPayrollRuleKind } from '../entities/teacher-payroll-rule';

/**
 * Everything the payslip PDF needs to lay out a page — assembled by
 * {@link GeneratePayslipPdf} from the confirmed `TeacherPayout` and the teacher
 * / center profile it resolves. `baseAmountMad` / `percentSnapshot` are `null`
 * for a `fixed-monthly` payout (no attribution base or percent applies); the
 * renderer omits that breakdown line rather than printing "0" for a rule kind
 * it doesn't apply to.
 */
export type PayslipPdfInput = {
  locale: 'fr' | 'ar';
  payoutId: string;
  teacher: { fr: string; ar: string };
  month: string; // 'YYYY-MM'
  status: TeacherPayoutStatus;
  ruleKind: TeacherPayrollRuleKind;
  baseAmountMad: number | null;
  percentSnapshot: number | null;
  amountMad: number;
  notes: string | null;
  center: {
    name: string;
    address: string;
    phone: string;
    email: string;
    /** Raw image bytes (PNG or JPEG) of the center's logo, or `null` when unset. */
    logoBytes: Uint8Array | null;
  };
};

/**
 * Port for rendering a teacher payslip to a printable PDF (SOU-75). The
 * concrete adapter (`pdf-lib`, desktop-only today) lives in
 * `apps/desktop/src/data/pdf/`, reusing the invoice PDF adapter's font/layout
 * setup; the domain only declares the contract so the composition root can
 * wire it like any other adapter. `render`'s *content* must depend only on
 * `input` — no hidden state beyond the PDF library's own save-time metadata
 * (creation timestamp).
 */
export interface PayslipPdfRenderer {
  render(input: PayslipPdfInput): Promise<Uint8Array>;
}
