import { z } from 'zod';
import { ValidationError } from './errors.js';

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
  'duration',
  'distance_duration',
  'bodyweight_weighted',
  'bodyweight_assisted',
  'short_distance_weight',
  'bodyweight_reps',
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

const titleSchema = z.string().min(1).max(255);
const descriptionSchema = z.string().max(4096);
const notesSchema = z.string().max(2048);

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
const muscleGroupSchema = z.enum(MUSCLE_GROUPS);
const equipmentCategorySchema = z.enum(EQUIPMENT_CATEGORIES);

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

const routineBodySchema = z
  .object({
    title: titleSchema,
    folder_id: z.number().int().positive().nullable().optional(),
    notes: notesSchema.optional(),
    exercises: z.array(routineExerciseSchema).min(1),
  })
  .strict();

const exerciseTemplateCreateSchema = z
  .object({
    title: z.string().min(1).max(100),
    type: z.enum(CUSTOM_EXERCISE_TYPES),
    primary_muscle_group: muscleGroupSchema,
    secondary_muscle_groups: z.array(muscleGroupSchema).optional(),
    equipment_category: equipmentCategorySchema.optional(),
    is_custom: z.boolean().optional(),
  })
  .strict();

const bodyMeasurementMetrics = z
  .object({
    weight_kg: z.number().finite().nullable().optional(),
    lean_mass_kg: z.number().finite().nullable().optional(),
    fat_percent: z.number().finite().nullable().optional(),
    neck_cm: z.number().finite().nullable().optional(),
    shoulder_cm: z.number().finite().nullable().optional(),
    chest_cm: z.number().finite().nullable().optional(),
    left_bicep_cm: z.number().finite().nullable().optional(),
    right_bicep_cm: z.number().finite().nullable().optional(),
    left_forearm_cm: z.number().finite().nullable().optional(),
    right_forearm_cm: z.number().finite().nullable().optional(),
    abdomen: z.number().finite().nullable().optional(),
    waist: z.number().finite().nullable().optional(),
    hips: z.number().finite().nullable().optional(),
    left_thigh: z.number().finite().nullable().optional(),
    right_thigh: z.number().finite().nullable().optional(),
    left_calf: z.number().finite().nullable().optional(),
    right_calf: z.number().finite().nullable().optional(),
  })
  .strict();

const bodyMeasurementCreateSchema = bodyMeasurementMetrics.extend({
  date: dateSchema,
});

const bodyMeasurementUpdateSchema = bodyMeasurementMetrics;

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
  hevy_create_routine: z.object({ routine: routineBodySchema }).strict(),
  hevy_update_routine: z.object({ routineId: uuid, routine: routineBodySchema }).strict(),

  hevy_list_routine_folders: z
    .object({ page: pageSchema.optional(), pageSize: pageSizeSchema.optional() })
    .strict(),
  hevy_get_routine_folder: z.object({ folderId: z.coerce.number().int().positive() }).strict(),
  hevy_create_routine_folder: z.object({ title: titleSchema }).strict(),

  hevy_list_exercise_templates: z
    .object({ page: pageSchema.optional(), pageSize: pageSizeLargeSchema.optional() })
    .strict(),
  hevy_get_exercise_template: z.object({ exerciseTemplateId: exerciseTemplateIdSchema }).strict(),
  hevy_create_exercise_template: z.object({ exercise: exerciseTemplateCreateSchema }).strict(),

  hevy_search_exercise_templates: z
    .object({
      query: z.string().min(1).max(255),
      primaryMuscleGroup: muscleGroupSchema.optional(),
      refresh: z.boolean().optional(),
    })
    .strict(),

  hevy_get_exercise_history: z
    .object({
      exerciseTemplateId: exerciseTemplateIdSchema,
      page: pageSchema.optional(),
      pageSize: pageSizeSchema.optional(),
    })
    .strict(),

  hevy_list_body_measurements: z
    .object({ page: pageSchema.optional(), pageSize: pageSizeSchema.optional() })
    .strict(),
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
