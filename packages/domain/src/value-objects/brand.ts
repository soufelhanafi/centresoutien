/**
 * Nominal typing helper. `Brand<string, 'StudentId'>` is assignable from a
 * plain string only through an explicit cast, so a `StudentId` can never be
 * passed where a `TeacherId` is expected.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
