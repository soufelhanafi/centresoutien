/**
 * How a guardian relates to the student. A closed set of enum **tokens** — the
 * domain stores only the token (`pere` | `mere` | `tuteur` | `autre`); the FR/AR
 * display labels live in the renderer i18n (`t(\`guardian.relation.${token}\`)`),
 * never in the domain, so the core stays language-agnostic and portable.
 */
export const GUARDIAN_RELATIONS = ['pere', 'mere', 'tuteur', 'autre'] as const;

export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

/** True when `value` is one of the known guardian-relation tokens. */
export function isGuardianRelation(value: string): value is GuardianRelation {
  return (GUARDIAN_RELATIONS as readonly string[]).includes(value);
}
