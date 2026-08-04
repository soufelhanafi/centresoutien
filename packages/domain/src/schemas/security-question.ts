import { z } from 'zod';
import { SECURITY_QUESTION_KEYS } from '../entities/security-question';

export const SECURITY_ANSWER_MIN = 2;
export const SECURITY_ANSWER_MAX = 200;
export const SECURITY_QUESTIONS_COUNT = 3;

const questionKey = z.enum(SECURITY_QUESTION_KEYS);

const answerAtSetup = z
  .string()
  .trim()
  .min(SECURITY_ANSWER_MIN, { message: 'security-answer-too-short' })
  .max(SECURITY_ANSWER_MAX, { message: 'security-answer-too-long' });

/**
 * Setup/re-setup input: exactly three questions, distinct keys, an answer
 * for each. `answer` here is the plaintext the use case hashes; it is never
 * persisted as-is.
 */
export const setSecurityQuestionsSchema = z.object({
  questions: z
    .array(z.object({ questionKey, answer: answerAtSetup }))
    .length(SECURITY_QUESTIONS_COUNT, { message: 'security-questions-must-be-exactly-three' })
    .refine((qs) => new Set(qs.map((q) => q.questionKey)).size === qs.length, {
      message: 'security-questions-must-be-distinct',
    }),
});

export type SetSecurityQuestionsInput = z.infer<typeof setSecurityQuestionsSchema>;

/**
 * Verification input at reset time. Answers are bounded but not
 * length-trimmed to a minimum here — a too-short answer simply won't match
 * any stored hash, which is exactly the "wrong answer" outcome the throttle
 * already handles; no need for a separate validation error.
 */
export const verifySecurityAnswersSchema = z.object({
  answers: z
    .array(z.object({ questionKey, answer: z.string().min(1).max(SECURITY_ANSWER_MAX) }))
    .length(SECURITY_QUESTIONS_COUNT, { message: 'security-answers-must-be-exactly-three' }),
});

export type VerifySecurityAnswersInput = z.infer<typeof verifySecurityAnswersSchema>;
