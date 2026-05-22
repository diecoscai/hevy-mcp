import { z } from 'zod';
import { ValidationError } from './errors.js';
// v0.5.0: write-tool schemas are sourced from Hevy's vendored OpenAPI spec
// via kubb (`npm run generate`) where the generated output is a faithful,
// durable representation of the wire contract. The overrides layer re-applies
// behaviors the spec omits but the live server enforces (see docs/api-quirks.md).
//
// Not every write tool could be wired: Hevy's spec marks nearly every request
// field `optional` and never models `required`, so the generated request-body
// objects accept `{}` as a valid workout/routine. Using them directly as the
// validation source of truth would LOOSEN validation. The durable signal the
// generated schemas DO carry well — and the one that caused the v0.3.0 bug
// class (quirks §1, §2) — is the enum value sets. Those are wired in;
// over-loose object structure stays hand-written. See per-tool notes below.
import { customExerciseTypeSchema } from './generated/zod/customExerciseTypeSchema.js';
import { equipmentCategorySchema } from './generated/zod/equipmentCategorySchema.js';
import { muscleGroupSchema } from './generated/zod/muscleGroupSchema.js';
import { putBodyMeasurementSchema } from './generated/zod/putBodyMeasurementSchema.js';
import { nonEmptyText, strict } from './schemas/overrides.js';

export const SET_TYPES = ['warmup', 'normal', 'failure', 'dropset'] as const;

export const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export const MUSCLE_GROUPS = [
  'abdominals',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'calves',
  'glutes',
  'abductors',
  'adductors',
  'lats',
  'upper_back',
  'traps',
  'lower_back',
  'chest',
  'cardio',
  'neck',
  'full_body',
  'other',
] as const;

export const EQUIPMENT_CATEGORIES = [
  'none',
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'plate',
  'resistance_band',
  'suspension',
  'other',
] as const;

export const EXERCISE_TYPES = [
  'weight_reps',
  'reps_only',
  'duration',
  'distance_duration',
  'bodyweight_weighted',
  'bodyweight_assisted',
  'short_distance_weight',
  'floors_duration',
  'steps_duration',
  'bodyweight_reps',
] as const;

export const CUSTOM_EXERCISE_TYPES = [
  'weight_reps',
  'reps_only',
  'bodyweight_reps',
  'bodyweight_assisted_reps',
  'duration',
  'weight_duration',
  'distance_duration',
  'short_distance_weight',
] as const;

const uuid = z.string().uuid();
const exerciseTemplateIdSchema = z
  .string()
  .min(1)
  .refine(
    (v) =>
      /^[0-9A-F]{8}$/.test(v) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v),
    {
      message: 'exercise template id must be 8-uppercase-hex (built-in) or lowercase UUID (custom)',
    }
  );

// quirk §4: the server rejects empty notes/description; `nonEmptyText`
// re-applies the minLength(1) the spec omits.
const titleSchema = nonEmptyText(255);
const descriptionSchema = nonEmptyText(4096);
const notesSchema = nonEmptyText(2048);

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(10).default(10);
const pageSizeLargeSchema = z.coerce.number().int().min(1).max(100).default(10);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .refine(
    (v) => {
      const [y, m, d] = v.split('-').map(Number);
      if (!y || !m || !d) return false;
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    },
    { message: 'date must be a valid calendar date (YYYY-MM-DD)' }
  );

const isoDateTimeSchema = z
  .string()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'must be an ISO-8601 datetime',
  });

const rpeSchema = z
  .union([z.number(), z.null()])
  .refine((v) => v === null || (RPE_VALUES as readonly number[]).includes(v as number), {
    message: `rpe must be null or one of ${RPE_VALUES.join(', ')}`,
  });

const setTypeSchema = z.enum(SET_TYPES);

const workoutSetSchema = z
  .object({
    type: setTypeSchema,
    weight_kg: z.number().optional(),
    reps: z.number().int().optional(),
    distance_meters: z.number().optional(),
    duration_seconds: z.number().optional(),
    rpe: rpeSchema.optional(),
    custom_metric: z.number().optional(),
  })
  .strict();

const routineSetSchema = z
  .object({
    type: setTypeSchema,
    weight_kg: z.number().optional(),
    reps: z.number().int().optional(),
    distance_meters: z.number().optional(),
    duration_seconds: z.number().optional(),
    rpe: rpeSchema.optional(),
    custom_metric: z.number().optional(),
    rep_range: z
      .object({ start: z.number().int().min(0), end: z.number().int().min(0) })
      .strict()
      .optional(),
  })
  .strict();

const workoutExerciseSchema = z
  .object({
    exercise_template_id: exerciseTemplateIdSchema,
    superset_id: z.number().int().nullable().optional(),
    notes: notesSchema.optional(),
    sets: z.array(workoutSetSchema).min(1),
  })
  .strict();

const routineExerciseSchema = z
  .object({
    exercise_template_id: exerciseTemplateIdSchema,
    superset_id: z.number().int().nullable().optional(),
    rest_seconds: z.number().int().min(0).optional(),
    notes: notesSchema.optional(),
    sets: z.array(routineSetSchema).min(1),
  })
  .strict();

const workoutBodySchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional(),
    start_time: isoDateTimeSchema,
    end_time: isoDateTimeSchema,
    is_private: z.boolean().optional(),
    routine_id: uuid.optional(),
    exercises: z.array(workoutExerciseSchema).min(1),
  })
  .strict();

const routineBodyCreateSchema = z
  .object({
    title: titleSchema,
    folder_id: z.number().int().positive().nullable().optional(),
    notes: notesSchema.optional(),
    exercises: z.array(routineExerciseSchema).min(1),
  })
  .strict();

const routineBodyUpdateSchema = z
  .object({
    title: titleSchema,
    notes: notesSchema.optional(),
    exercises: z.array(routineExerciseSchema).min(1),
  })
  .strict();

// Enum fields are generated (durable against spec drift); object structure is
// hand-written because Hevy's spec marks `title` etc. with no maxLength and
// models `other_muscles` as required — the live server treats it as optional
// (quirk §1). title cap (100) and `.strict()` are spec-omitted overrides.
const exerciseTemplateCreateSchema = z
  .object({
    title: nonEmptyText(100),
    exercise_type: customExerciseTypeSchema,
    muscle_group: muscleGroupSchema,
    other_muscles: z.array(muscleGroupSchema).optional(),
    equipment_category: equipmentCategorySchema,
  })
  .strict();

// Body measurement metrics are sourced from the generated `putBodyMeasurementSchema`
// (the 17 flat optional numeric fields). The body shape is flat on the wire for
// both POST and PUT (quirk §7). `strict()` re-applies the unknown-key rejection
// the generated schema omits; `date` stays hand-written because the create body
// needs calendar-date validation that the generated `z.iso.date()` does not
// guarantee identically. `.finite()` from the pre-0.5.0 hand-written schema is
// dropped intentionally — JSON cannot transport Infinity/NaN, so it guarded
// nothing, and it is not a documented quirk.
const bodyMeasurementCreateSchema = strict(putBodyMeasurementSchema).extend({
  date: dateSchema,
});

const bodyMeasurementUpdateSchema = strict(putBodyMeasurementSchema);

const schemas = {
  hevy_get_user_info: z.object({}).strict(),

  hevy_list_workouts: z
    .object({ page: pageSchema.optional(), pageSize: pageSizeSchema.optional() })
    .strict(),
  hevy_get_workout: z.object({ workoutId: uuid }).strict(),
  hevy_get_workout_count: z.object({}).strict(),
  hevy_get_workout_events: z
    .object({
      since: isoDateTimeSchema.optional(),
      page: pageSchema.optional(),
      pageSize: pageSizeSchema.optional(),
    })
    .strict(),
  hevy_create_workout: z.object({ workout: workoutBodySchema }).strict(),
  hevy_update_workout: z.object({ workoutId: uuid, workout: workoutBodySchema }).strict(),

  hevy_list_routines: z
    .object({ page: pageSchema.optional(), pageSize: pageSizeSchema.optional() })
    .strict(),
  hevy_get_routine: z.object({ routineId: uuid }).strict(),
  hevy_create_routine: z.object({ routine: routineBodyCreateSchema }).strict(),
  hevy_update_routine: z.object({ routineId: uuid, routine: routineBodyUpdateSchema }).strict(),

  hevy_list_routine_folders: z
    .object({ page: pageSchema.optional(), pageSize: pageSizeSchema.optional() })
    .strict(),
  hevy_get_routine_folder: z.object({ folderId: z.coerce.number().int().positive() }).strict(),
  hevy_create_routine_folder: z.object({ title: titleSchema }).strict(),

  hevy_list_exercise_templates: z
    .object({ page: pageSchema.optional(), pageSize: pageSizeLargeSchema.optional() })
    .strict(),
  hevy_search_exercise_templates: z
    .object({
      query: z.string().min(1).max(100),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .strict(),
  hevy_get_exercise_template: z.object({ exerciseTemplateId: exerciseTemplateIdSchema }).strict(),
  hevy_create_exercise_template: z.object({ exercise: exerciseTemplateCreateSchema }).strict(),

  hevy_get_exercise_history: z
    .object({
      exerciseTemplateId: exerciseTemplateIdSchema,
      page: pageSchema.optional(),
      pageSize: pageSizeSchema.optional(),
      start_date: isoDateTimeSchema.optional(),
      end_date: isoDateTimeSchema.optional(),
    })
    .strict(),

  hevy_list_body_measurements: z
    .object({ page: pageSchema.optional(), pageSize: pageSizeSchema.optional() })
    .strict(),
  // flat by design — wire shape is flat (quirk §7); bodyMeasurementCreateSchema is already strict
  hevy_create_body_measurement: bodyMeasurementCreateSchema,
  hevy_get_body_measurement: z.object({ date: dateSchema }).strict(),
  hevy_update_body_measurement: z
    .object({ date: dateSchema, body_measurement: bodyMeasurementUpdateSchema })
    .strict(),
} as const;

export type ToolName = keyof typeof schemas;

export const TOOL_NAMES = Object.keys(schemas) as ToolName[];

export function isKnownTool(name: string): name is ToolName {
  return Object.hasOwn(schemas, name);
}

function formatIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.length ? issue.path.join('.') : '(root)';
  return `${path}: ${issue.message}`;
}

export function validateInput<T extends ToolName>(
  toolName: T,
  args: unknown
): z.infer<(typeof schemas)[T]> {
  if (!isKnownTool(toolName)) {
    throw new ValidationError(`unknown tool: ${toolName}`);
  }
  const schema = schemas[toolName] as z.ZodType;
  const result = schema.safeParse(args ?? {});
  if (!result.success) {
    const details = result.error.issues.map(formatIssue);
    const message = details.join('; ');
    throw new ValidationError(message, details);
  }
  return result.data as z.infer<(typeof schemas)[T]>;
}

export const __schemas = schemas;
