import type { FieldValues, Resolver, ResolverResult } from 'react-hook-form';

/**
 * A valid single Arabic letter (Alef) used only to probe validation. It is never
 * kept: the probed value is restored to `''` before the parsed result is handed
 * back to react-hook-form.
 */
const ARABIC_NAME_PROBE = 'ا';

type BilingualNameShape = { readonly fr?: unknown; readonly ar?: unknown };
type WithBilingualName = { readonly name?: BilingualNameShape };

function readArabicName(values: FieldValues): unknown {
  return (values as WithBilingualName).name?.ar;
}

/**
 * SOU-271 MOCK — REMOVE ONCE `packages/domain` RELAXES THE ARABIC NAME RULE.
 *
 * The bilingual `name` schemas in the domain still require `name.ar` (min 1),
 * so an FR-only entry fails validation and, because zod returns no parsed values
 * on failure, dropping the error alone would submit `{}`. Until the domain schema
 * allows `name.ar === ''`, this wrapper validates an empty Arabic name against a
 * throwaway probe letter (satisfying the current min-length rule) and then
 * restores `''` on the parsed output — so FR stays required, every other domain
 * rule still runs, and the Arabic side is effectively optional.
 *
 * Once the domain schema accepts `''`, delete this wrapper and pass
 * `zodResolver(schema)` directly: the probe branch becomes a pure no-op.
 */
export function withOptionalArabicName<
  TFieldValues extends FieldValues,
  TContext,
  TTransformedValues extends FieldValues,
>(
  resolver: Resolver<TFieldValues, TContext, TTransformedValues>,
): Resolver<TFieldValues, TContext, TTransformedValues> {
  return async (values, context, options) => {
    if (readArabicName(values) !== '') {
      return resolver(values, context, options);
    }
    const currentName = (values as WithBilingualName).name;
    const probed = { ...values, name: { ...currentName, ar: ARABIC_NAME_PROBE } } as TFieldValues;
    const result = await resolver(probed, context, options);
    return clearProbedArabicName(result);
  };
}

function clearProbedArabicName<TFieldValues extends FieldValues, TTransformedValues extends FieldValues>(
  result: ResolverResult<TFieldValues, TTransformedValues>,
): ResolverResult<TFieldValues, TTransformedValues> {
  const parsedName = (result.values as WithBilingualName).name;
  if (!parsedName) return result;
  const values = { ...result.values, name: { ...parsedName, ar: '' } } as TTransformedValues;
  return { ...result, values } as ResolverResult<TFieldValues, TTransformedValues>;
}
