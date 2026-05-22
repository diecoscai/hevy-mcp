// The Hevy OpenAPI spec is imperfect. Generated schemas match the spec;
// these helpers re-apply behaviors the spec omits but the live server
// enforces (see docs/api-quirks.md). Keep this file SMALL — every entry
// is a documented divergence, not a preference.
//
// Import note: this file composes with kubb-generated schemas, which
// import `zod/v4`. In zod 4.x the `'zod'` and `'zod/v4'` specifiers
// resolve to the same runtime AND the same type declarations, so
// importing from `'zod'` here keeps `npm run build` clean while still
// type-checking against the generated `zod/v4` objects.
import { z } from 'zod';

/** Server rejects empty notes/description; spec types them as plain strings. */
export const nonEmptyText = (max: number) => z.string().min(1).max(max);

/**
 * Re-assert .strict() on a generated object schema so unknown keys are
 * rejected before any network call. kubb-generated object schemas are
 * not strict by default. This is a helper rather than an inline `.strict()`
 * call because generated files are overwritten on every `npm run generate`
 * and must not be hand-edited — the divergence has to live here instead.
 */
export function strict<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<T> {
  return schema.strict();
}
