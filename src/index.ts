#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createTemplateCache,
  isCacheDisabled,
  TEMPLATE_LIST_PREFIX,
  type TtlCache,
  templateListKey,
  templateOneKey,
} from './cache.js';
import { MissingCredentialsError, resolveAllowWrites, resolveApiKey } from './config.js';
import { dryRunResult, HevyApiError, toToolExecutionError, UnknownToolError } from './errors.js';
import { isKnownTool, validateInput } from './validate.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

const BASE_URL = 'https://api.hevyapp.com';
const ALLOW_WRITES = resolveAllowWrites();
const CACHE_DISABLED = isCacheDisabled();
const templateCache: TtlCache<unknown> | null = CACHE_DISABLED ? null : createTemplateCache();

let API_KEY = '';

async function hevyFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const apiKey = API_KEY;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new HevyApiError(res.status, text);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Some POST endpoints (e.g. exercise_templates create) return the new
    // resource id as plain text, not JSON. Surface the raw string instead
    // of crashing.
    return text;
  }
}

const pageParams = {
  page: { type: 'integer', minimum: 1, description: 'Page number, 1-indexed (default 1).' },
  pageSize: {
    type: 'integer',
    minimum: 1,
    maximum: 10,
    description: 'Items per page (1-10, default 10). The Hevy server rejects >10 with HTTP 400.',
  },
} as const;

const pageParamsLarge = {
  page: { type: 'integer', minimum: 1, description: 'Page number, 1-indexed (default 1).' },
  pageSize: {
    type: 'integer',
    minimum: 1,
    maximum: 100,
    description:
      'Items per page (1-100, default 10). Exercise templates are the only endpoint that accepts up to 100.',
  },
} as const;

const setTypeEnum = ['warmup', 'normal', 'failure', 'dropset'];
const rpeEnum = [null, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const muscleGroupEnum = [
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
];
const equipmentEnum = [
  'none',
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'plate',
  'resistance_band',
  'suspension',
  'other',
];
const customExerciseTypeEnum = [
  'weight_reps',
  'reps_only',
  'bodyweight_reps',
  'bodyweight_assisted_reps',
  'duration',
  'weight_duration',
  'distance_duration',
  'short_distance_weight',
];

const workoutSetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: { type: 'string', enum: setTypeEnum },
    weight_kg: { type: 'number' },
    reps: { type: 'integer' },
    distance_meters: { type: 'number' },
    duration_seconds: { type: 'number' },
    rpe: { enum: rpeEnum, description: 'null or one of 6, 7, 7.5, 8, 8.5, 9, 9.5, 10' },
    custom_metric: { type: 'number' },
  },
};

const routineSetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: { type: 'string', enum: setTypeEnum },
    weight_kg: { type: 'number' },
    reps: { type: 'integer' },
    distance_meters: { type: 'number' },
    duration_seconds: { type: 'number' },
    rpe: { enum: rpeEnum },
    custom_metric: { type: 'number' },
    rep_range: {
      type: 'object',
      additionalProperties: false,
      properties: {
        start: { type: 'integer', minimum: 0 },
        end: { type: 'integer', minimum: 0 },
      },
      description: 'Routines only — rep_range is not accepted on workouts.',
    },
  },
};

const workoutExerciseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['exercise_template_id', 'sets'],
  properties: {
    exercise_template_id: {
      type: 'string',
      description:
        'Built-in templates use 8-char uppercase hex (e.g. 79D0BB3A); custom templates use a lowercase UUID.',
    },
    superset_id: {
      type: ['integer', 'null'],
      description:
        'Contiguous integer group id (or null). Supersets must be adjacent and share the same id.',
    },
    notes: { type: 'string', minLength: 1, maxLength: 2048 },
    sets: { type: 'array', minItems: 1, items: workoutSetSchema },
  },
};

const routineExerciseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['exercise_template_id', 'sets'],
  properties: {
    exercise_template_id: { type: 'string' },
    superset_id: { type: ['integer', 'null'] },
    rest_seconds: { type: 'integer', minimum: 0 },
    notes: { type: 'string', minLength: 1, maxLength: 2048 },
    sets: { type: 'array', minItems: 1, items: routineSetSchema },
  },
};

const workoutBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'start_time', 'end_time', 'exercises'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', minLength: 1, maxLength: 4096 },
    start_time: { type: 'string', description: 'ISO-8601 datetime.' },
    end_time: { type: 'string', description: 'ISO-8601 datetime.' },
    is_private: { type: 'boolean' },
    routine_id: { type: 'string', format: 'uuid' },
    exercises: { type: 'array', minItems: 1, items: workoutExerciseSchema },
  },
};

const routineBodyCreateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'exercises'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    folder_id: { type: ['integer', 'null'], minimum: 1 },
    notes: { type: 'string', minLength: 1, maxLength: 2048 },
    exercises: { type: 'array', minItems: 1, items: routineExerciseSchema },
  },
};

const routineBodyUpdateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'exercises'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    notes: { type: 'string', minLength: 1, maxLength: 2048 },
    exercises: { type: 'array', minItems: 1, items: routineExerciseSchema },
  },
};

const bodyMeasurementMetricsProps = {
  weight_kg: { type: ['number', 'null'] },
  lean_mass_kg: { type: ['number', 'null'] },
  fat_percent: { type: ['number', 'null'] },
  neck_cm: { type: ['number', 'null'] },
  shoulder_cm: { type: ['number', 'null'] },
  chest_cm: { type: ['number', 'null'] },
  left_bicep_cm: { type: ['number', 'null'] },
  right_bicep_cm: { type: ['number', 'null'] },
  left_forearm_cm: { type: ['number', 'null'] },
  right_forearm_cm: { type: ['number', 'null'] },
  abdomen: { type: ['number', 'null'] },
  waist: { type: ['number', 'null'] },
  hips: { type: ['number', 'null'] },
  left_thigh: { type: ['number', 'null'] },
  right_thigh: { type: ['number', 'null'] },
  left_calf: { type: ['number', 'null'] },
  right_calf: { type: ['number', 'null'] },
} as const;

const bodyMeasurementUpdateBody = {
  type: 'object',
  additionalProperties: false,
  properties: bodyMeasurementMetricsProps,
};

const TOOLS: Tool[] = [
  {
    name: 'hevy_get_user_info',
    description:
      'Return the authenticated user (name, id, profile URL). Reads GET /v1/user/info. Requires a Hevy Pro api-key.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },

  {
    name: 'hevy_list_workouts',
    description:
      'List workouts newest-first, paginated. Use this to discover workout ids; fetch a single full record with hevy_get_workout, or just the count with hevy_get_workout_count. pageSize is 1-10 (Hevy returns 400 for >10). Response envelope: { page, page_count, workouts: [...] }. Empty account returns workouts: []. No DELETE endpoint exists on the Hevy API.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...pageParams } },
  },
  {
    name: 'hevy_get_workout',
    description: 'Fetch one workout by UUID. Returns the full record including exercises and sets.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workoutId'],
      properties: { workoutId: { type: 'string', format: 'uuid' } },
    },
  },
  {
    name: 'hevy_get_workout_count',
    description: 'Return { workout_count }: the total number of workouts on the account.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'hevy_get_workout_events',
    description:
      'Delta sync feed: events newer than `since` (ISO-8601). Each event is either { type: "updated", workout } or { type: "deleted", id, deleted_at }. To incrementally sync a local cache: on first call pass since=1970-01-01T00:00:00Z, then for each subsequent call pass the timestamp of the newest event you have seen. This is the ONLY way to detect deletions — the Hevy API has no DELETE endpoint, so deleted workouts surface here and nowhere else. pageSize 1-10.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        since: {
          type: 'string',
          description: 'ISO-8601 datetime; only events after this are returned.',
        },
        ...pageParams,
      },
    },
  },
  {
    name: 'hevy_create_workout',
    description:
      'Create a workout (POST /v1/workouts). Required: title, start_time (ISO-8601), end_time (ISO-8601), exercises[]. Each exercise needs an exercise_template_id — call hevy_list_exercise_templates (pageSize up to 100) to find it by name, or hevy_get_exercise_template if you already know the id. Set types: warmup|normal|failure|dropset. RPE is null or one of 6, 7, 7.5, 8, 8.5, 9, 9.5, 10. Superset ids must be contiguous across adjacent exercises. rep_range is routines-only and is rejected here. Dry-run by default: returns { dry_run: true, executed: false, ... } unless the env var HEVY_MCP_ALLOW_WRITES=1 is set on the server process.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workout'],
      properties: { workout: workoutBodySchema },
    },
  },
  {
    name: 'hevy_update_workout',
    description:
      'Full replace of a workout (PUT /v1/workouts/{id}). Any field not re-sent is dropped — to preserve a field, send it back unchanged. Each exercise needs an exercise_template_id (find via hevy_list_exercise_templates or hevy_get_exercise_template). Dry-run by default: returns { dry_run: true, executed: false, ... } unless HEVY_MCP_ALLOW_WRITES=1 is set on the server process. No DELETE endpoint exists on the Hevy API.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workoutId', 'workout'],
      properties: {
        workoutId: { type: 'string', format: 'uuid' },
        workout: workoutBodySchema,
      },
    },
  },

  {
    name: 'hevy_list_routines',
    description:
      'List routines. pageSize 1-10 (max enforced by server). Envelope: { page, page_count, routines }. No DELETE endpoint.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...pageParams } },
  },
  {
    name: 'hevy_get_routine',
    description: 'Fetch one routine by UUID.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['routineId'],
      properties: { routineId: { type: 'string', format: 'uuid' } },
    },
  },
  {
    name: 'hevy_create_routine',
    description:
      'Create a routine (POST /v1/routines). Required: title, exercises[]. Each exercise needs an exercise_template_id — call hevy_list_exercise_templates to find it. Optional folder_id (positive integer) places the routine in a folder (use hevy_list_routine_folders to discover folder ids). Set types: warmup|normal|failure|dropset. rep_range { start, end } is accepted on routine sets (NOT on workout sets). Dry-run by default: returns { dry_run: true, executed: false, ... } unless HEVY_MCP_ALLOW_WRITES=1 is set on the server process.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['routine'],
      properties: { routine: routineBodyCreateSchema },
    },
  },
  {
    name: 'hevy_update_routine',
    description:
      "Full replace of a routine (PUT /v1/routines/{id}). Omitted fields are dropped — to preserve a field, send it back unchanged. Each exercise needs an exercise_template_id (find via hevy_list_exercise_templates). Note: folder_id is NOT accepted on update; the Hevy API rejects it with 400. The routine's folder cannot be changed through this tool. Dry-run by default: returns { dry_run: true, executed: false, ... } unless HEVY_MCP_ALLOW_WRITES=1 is set on the server process.",
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['routineId', 'routine'],
      properties: {
        routineId: { type: 'string', format: 'uuid' },
        routine: routineBodyUpdateSchema,
      },
    },
  },

  {
    name: 'hevy_list_routine_folders',
    description:
      'List routine folders. pageSize 1-10. Envelope: { page, page_count, routine_folders }. No DELETE endpoint.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...pageParams } },
  },
  {
    name: 'hevy_get_routine_folder',
    description: 'Fetch one routine folder by its positive integer id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['folderId'],
      properties: { folderId: { type: 'integer', minimum: 1 } },
    },
  },
  {
    name: 'hevy_create_routine_folder',
    description:
      'Create a routine folder (POST /v1/routine_folders). Takes only `title`. The new folder is inserted at index 0; existing folders shift down by one. There is no update or delete tool for folders — once created, the title is fixed. Dry-run by default: returns { dry_run: true, executed: false, ... } unless HEVY_MCP_ALLOW_WRITES=1 is set on the server process.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: { title: { type: 'string', minLength: 1, maxLength: 255 } },
    },
  },

  {
    name: 'hevy_list_exercise_templates',
    description:
      'List exercise templates (built-in + custom). Envelope: { page, page_count, exercise_templates }. pageSize is 1-100 — this is the ONE endpoint with a larger cap; every other list is capped at 10. Built-in ids are 8-char uppercase hex; custom ids are lowercase UUIDs.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { ...pageParamsLarge },
    },
  },
  {
    name: 'hevy_get_exercise_template',
    description:
      'Fetch one exercise template by id. Accepts both 8-char uppercase hex (built-in) and lowercase UUID (custom).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['exerciseTemplateId'],
      properties: { exerciseTemplateId: { type: 'string' } },
    },
  },
  {
    name: 'hevy_create_exercise_template',
    description:
      'Create a custom exercise template (POST /v1/exercise_templates). Required: title, exercise_type, muscle_group, equipment_category. exercise_type enum (8): weight_reps, reps_only, bodyweight_reps, bodyweight_assisted_reps, duration, weight_duration, distance_duration, short_distance_weight. muscle_group enum (20): abdominals, shoulders, biceps, triceps, forearms, quadriceps, hamstrings, calves, glutes, abductors, adductors, lats, upper_back, traps, lower_back, chest, cardio, neck, full_body, other. equipment_category enum (9): none, barbell, dumbbell, kettlebell, machine, plate, resistance_band, suspension, other. other_muscles is an optional array of muscle_group values. Dry-run by default: returns { dry_run: true, executed: false, ... } unless HEVY_MCP_ALLOW_WRITES=1 is set on the server process.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['exercise'],
      properties: {
        exercise: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'exercise_type', 'muscle_group', 'equipment_category'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 100 },
            exercise_type: { type: 'string', enum: customExerciseTypeEnum },
            muscle_group: { type: 'string', enum: muscleGroupEnum },
            other_muscles: {
              type: 'array',
              items: { type: 'string', enum: muscleGroupEnum },
            },
            equipment_category: { type: 'string', enum: equipmentEnum },
          },
        },
      },
    },
  },

  {
    name: 'hevy_get_exercise_history',
    description:
      'List every logged set for the given exercise template (one row per set, includes warmups/dropsets/failures). pageSize 1-10.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['exerciseTemplateId'],
      properties: {
        exerciseTemplateId: { type: 'string' },
        ...pageParams,
      },
    },
  },

  {
    name: 'hevy_list_body_measurements',
    description:
      'List body measurements (GET /v1/body_measurements). Envelope: { page, page_count, body_measurements }. pageSize 1-10. Records are keyed by date (YYYY-MM-DD), not by id. No DELETE endpoint exists.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...pageParams } },
  },
  {
    name: 'hevy_create_body_measurement',
    description:
      'Create one body-measurements record (POST /v1/body_measurements). Required: date (YYYY-MM-DD). All metric fields are optional and nullable: weight_kg, lean_mass_kg, fat_percent, neck_cm, shoulder_cm, chest_cm, left_bicep_cm, right_bicep_cm, left_forearm_cm, right_forearm_cm, abdomen, waist, hips, left_thigh, right_thigh, left_calf, right_calf. If a record already exists for that date, the server returns 409 — use hevy_update_body_measurement instead. Dry-run by default: returns { dry_run: true, executed: false, ... } unless HEVY_MCP_ALLOW_WRITES=1 is set on the server process.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['date'],
      properties: {
        date: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Calendar date in YYYY-MM-DD (rejected if not a real date).',
        },
        ...bodyMeasurementMetricsProps,
      },
    },
  },
  {
    name: 'hevy_get_body_measurement',
    description:
      'Fetch one body-measurements record by date (GET /v1/body_measurements/{date}). Returns 404 if no record exists for that date.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['date'],
      properties: {
        date: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
      },
    },
  },
  {
    name: 'hevy_update_body_measurement',
    description:
      'Full replace of the body-measurements record for a date (PUT /v1/body_measurements/{date}). FULL REPLACE — any metric field NOT sent in body_measurement is overwritten to NULL on the server. To "update just one metric": call hevy_get_body_measurement for that date first, modify the metric you want, then send ALL fields back. Dry-run by default: returns { dry_run: true, executed: false, ... } unless HEVY_MCP_ALLOW_WRITES=1 is set on the server process.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['date', 'body_measurement'],
      properties: {
        date: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        body_measurement: bodyMeasurementUpdateBody,
      },
    },
  },
];

function guardWrite(method: 'POST' | 'PUT', path: string, body: unknown) {
  if (!ALLOW_WRITES) {
    return dryRunResult(method, path, body);
  }
  return null;
}

async function dispatch(name: string, rawArgs: unknown): Promise<unknown> {
  if (!isKnownTool(name)) {
    throw new UnknownToolError(name);
  }

  switch (name) {
    case 'hevy_get_user_info': {
      validateInput(name, rawArgs);
      return hevyFetch('/v1/user/info');
    }

    case 'hevy_list_workouts': {
      const args = validateInput(name, rawArgs);
      const page = args.page ?? 1;
      const pageSize = args.pageSize ?? 10;
      return hevyFetch(`/v1/workouts?page=${page}&pageSize=${pageSize}`);
    }
    case 'hevy_get_workout': {
      const args = validateInput(name, rawArgs);
      return hevyFetch(`/v1/workouts/${args.workoutId}`);
    }
    case 'hevy_get_workout_count': {
      validateInput(name, rawArgs);
      return hevyFetch('/v1/workouts/count');
    }
    case 'hevy_get_workout_events': {
      const args = validateInput(name, rawArgs);
      const page = args.page ?? 1;
      const pageSize = args.pageSize ?? 10;
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (args.since) params.set('since', args.since);
      return hevyFetch(`/v1/workouts/events?${params.toString()}`);
    }
    case 'hevy_create_workout': {
      const args = validateInput(name, rawArgs);
      const body = { workout: args.workout };
      const gate = guardWrite('POST', '/v1/workouts', body);
      if (gate) return gate;
      return hevyFetch('/v1/workouts', { method: 'POST', body: JSON.stringify(body) });
    }
    case 'hevy_update_workout': {
      const args = validateInput(name, rawArgs);
      const body = { workout: args.workout };
      const path = `/v1/workouts/${args.workoutId}`;
      const gate = guardWrite('PUT', path, body);
      if (gate) return gate;
      return hevyFetch(path, { method: 'PUT', body: JSON.stringify(body) });
    }

    case 'hevy_list_routines': {
      const args = validateInput(name, rawArgs);
      const page = args.page ?? 1;
      const pageSize = args.pageSize ?? 10;
      return hevyFetch(`/v1/routines?page=${page}&pageSize=${pageSize}`);
    }
    case 'hevy_get_routine': {
      const args = validateInput(name, rawArgs);
      return hevyFetch(`/v1/routines/${args.routineId}`);
    }
    case 'hevy_create_routine': {
      const args = validateInput(name, rawArgs);
      const body = { routine: args.routine };
      const gate = guardWrite('POST', '/v1/routines', body);
      if (gate) return gate;
      return hevyFetch('/v1/routines', { method: 'POST', body: JSON.stringify(body) });
    }
    case 'hevy_update_routine': {
      const args = validateInput(name, rawArgs);
      const body = { routine: args.routine };
      const path = `/v1/routines/${args.routineId}`;
      const gate = guardWrite('PUT', path, body);
      if (gate) return gate;
      return hevyFetch(path, { method: 'PUT', body: JSON.stringify(body) });
    }

    case 'hevy_list_routine_folders': {
      const args = validateInput(name, rawArgs);
      const page = args.page ?? 1;
      const pageSize = args.pageSize ?? 10;
      return hevyFetch(`/v1/routine_folders?page=${page}&pageSize=${pageSize}`);
    }
    case 'hevy_get_routine_folder': {
      const args = validateInput(name, rawArgs);
      return hevyFetch(`/v1/routine_folders/${args.folderId}`);
    }
    case 'hevy_create_routine_folder': {
      const args = validateInput(name, rawArgs);
      const body = { routine_folder: { title: args.title } };
      const gate = guardWrite('POST', '/v1/routine_folders', body);
      if (gate) return gate;
      return hevyFetch('/v1/routine_folders', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'hevy_list_exercise_templates': {
      const args = validateInput(name, rawArgs);
      const page = args.page ?? 1;
      const pageSize = args.pageSize ?? 10;
      const key = templateListKey(page, pageSize);
      const cached = templateCache?.get(key);
      if (cached !== undefined) return cached;
      const res = await hevyFetch(`/v1/exercise_templates?page=${page}&pageSize=${pageSize}`);
      templateCache?.set(key, res);
      return res;
    }
    case 'hevy_get_exercise_template': {
      const args = validateInput(name, rawArgs);
      const key = templateOneKey(args.exerciseTemplateId);
      const cached = templateCache?.get(key);
      if (cached !== undefined) return cached;
      const res = await hevyFetch(`/v1/exercise_templates/${args.exerciseTemplateId}`);
      templateCache?.set(key, res);
      return res;
    }
    case 'hevy_create_exercise_template': {
      const args = validateInput(name, rawArgs);
      const body = { exercise: args.exercise };
      const gate = guardWrite('POST', '/v1/exercise_templates', body);
      if (gate) return gate;
      const res = await hevyFetch('/v1/exercise_templates', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      templateCache?.invalidatePrefix(TEMPLATE_LIST_PREFIX);
      return res;
    }

    case 'hevy_get_exercise_history': {
      const args = validateInput(name, rawArgs);
      const page = args.page ?? 1;
      const pageSize = args.pageSize ?? 10;
      return hevyFetch(
        `/v1/exercise_history/${args.exerciseTemplateId}?page=${page}&pageSize=${pageSize}`
      );
    }

    case 'hevy_list_body_measurements': {
      const args = validateInput(name, rawArgs);
      const page = args.page ?? 1;
      const pageSize = args.pageSize ?? 10;
      return hevyFetch(`/v1/body_measurements?page=${page}&pageSize=${pageSize}`);
    }
    case 'hevy_create_body_measurement': {
      const args = validateInput(name, rawArgs);
      const gate = guardWrite('POST', '/v1/body_measurements', args);
      if (gate) return gate;
      return hevyFetch('/v1/body_measurements', {
        method: 'POST',
        body: JSON.stringify(args),
      });
    }
    case 'hevy_get_body_measurement': {
      const args = validateInput(name, rawArgs);
      return hevyFetch(`/v1/body_measurements/${args.date}`);
    }
    case 'hevy_update_body_measurement': {
      const args = validateInput(name, rawArgs);
      const path = `/v1/body_measurements/${args.date}`;
      const body = args.body_measurement;
      const gate = guardWrite('PUT', path, body);
      if (gate) return gate;
      return hevyFetch(path, { method: 'PUT', body: JSON.stringify(body) });
    }

    default: {
      const _exhaustive: never = name as never;
      void _exhaustive;
      throw new UnknownToolError(name);
    }
  }
}

const server = new Server(
  { name: pkg.name, version: pkg.version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    const result = await dispatch(name, args);
    if (
      result !== null &&
      typeof result === 'object' &&
      'content' in (result as Record<string, unknown>)
    ) {
      return result as { content: Array<{ type: 'text'; text: string }> };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return toToolExecutionError(err);
  }
});

function printUsage() {
  const lines = [
    `${pkg.name} ${pkg.version}`,
    '',
    'Usage:',
    '  npx @diecoscai/hevy-mcp           Start the MCP server on stdio.',
    '  npx @diecoscai/hevy-mcp --help    Show this help.',
    '  npx @diecoscai/hevy-mcp --version Show the installed version.',
    '',
    'Authentication:',
    '  Set the HEVY_API_KEY environment variable to a key from',
    '  https://hevy.com/settings?developer. Typically you put it in',
    '  your MCP client config (Claude Desktop, Cursor, etc.) under',
    '  the "env" block of the server entry.',
    '',
    'Writes (POST/PUT) require HEVY_MCP_ALLOW_WRITES=1; otherwise they return a dry-run payload.',
  ];
  console.log(lines.join('\n'));
}

async function startServer() {
  try {
    API_KEY = resolveApiKey();
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${pkg.name}@${pkg.version} running on stdio`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    printUsage();
    return;
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log(`${pkg.name}@${pkg.version}`);
    return;
  }
  if (cmd !== undefined) {
    console.error(`Unknown argument: ${cmd}`);
    printUsage();
    process.exit(2);
  }

  await startServer();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
