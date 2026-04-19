import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.js';
import {
  CUSTOM_EXERCISE_TYPES,
  EQUIPMENT_CATEGORIES,
  EXERCISE_TYPES,
  isKnownTool,
  MUSCLE_GROUPS,
  RPE_VALUES,
  SET_TYPES,
  TOOL_NAMES,
  validateInput,
} from '../src/validate.js';

const VALID_WORKOUT_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_ROUTINE_UUID = '22222222-2222-4222-8222-222222222222';
const VALID_CUSTOM_TEMPLATE_UUID = '33333333-3333-4333-8333-333333333333';
const BUILT_IN_TEMPLATE_ID = '79D0BB3A';

function validWorkoutBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Morning lift',
    start_time: '2026-04-19T08:00:00Z',
    end_time: '2026-04-19T09:00:00Z',
    exercises: [
      {
        exercise_template_id: BUILT_IN_TEMPLATE_ID,
        sets: [{ type: 'normal', weight_kg: 60, reps: 10 }],
      },
    ],
    ...overrides,
  };
}

function validRoutineBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Push day',
    exercises: [
      {
        exercise_template_id: BUILT_IN_TEMPLATE_ID,
        sets: [{ type: 'normal', reps: 8 }],
      },
    ],
    ...overrides,
  };
}

describe('enum fixtures', () => {
  it('SET_TYPES has exactly 4 values', () => {
    expect(SET_TYPES).toEqual(['warmup', 'normal', 'failure', 'dropset']);
    expect(SET_TYPES.length).toBe(4);
  });

  it('RPE_VALUES matches the Hevy spec', () => {
    expect([...RPE_VALUES]).toEqual([6, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
  });

  it('MUSCLE_GROUPS has exactly 20 entries', () => {
    expect(MUSCLE_GROUPS.length).toBe(20);
    expect(MUSCLE_GROUPS).toContain('chest');
    expect(MUSCLE_GROUPS).toContain('full_body');
  });

  it('EQUIPMENT_CATEGORIES has exactly 9 entries', () => {
    expect(EQUIPMENT_CATEGORIES.length).toBe(9);
    expect(EQUIPMENT_CATEGORIES).toContain('barbell');
    expect(EQUIPMENT_CATEGORIES).toContain('none');
  });

  it('EXERCISE_TYPES exposes 10 entries (8 custom + floors/steps duration)', () => {
    expect(EXERCISE_TYPES.length).toBe(10);
    expect(EXERCISE_TYPES).toContain('floors_duration');
    expect(EXERCISE_TYPES).toContain('steps_duration');
  });

  it('CUSTOM_EXERCISE_TYPES excludes floors_duration and steps_duration', () => {
    expect(CUSTOM_EXERCISE_TYPES.length).toBe(8);
    expect(CUSTOM_EXERCISE_TYPES).not.toContain('floors_duration');
    expect(CUSTOM_EXERCISE_TYPES).not.toContain('steps_duration');
  });

  it('exposes 22 tool names', () => {
    expect(TOOL_NAMES.length).toBe(22);
  });
});

describe('isKnownTool', () => {
  it('returns true for every advertised tool', () => {
    for (const name of TOOL_NAMES) {
      expect(isKnownTool(name)).toBe(true);
    }
  });

  it('returns false for unknown names', () => {
    expect(isKnownTool('not_a_tool')).toBe(false);
    expect(isKnownTool('')).toBe(false);
  });
});

describe('validateInput — happy paths', () => {
  it('accepts empty args for hevy_get_user_info', () => {
    expect(validateInput('hevy_get_user_info', {})).toEqual({});
  });

  it('accepts valid pagination for hevy_list_workouts', () => {
    const out = validateInput('hevy_list_workouts', { page: 1, pageSize: 10 });
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(10);
  });

  it('applies pagination defaults for hevy_list_workouts', () => {
    const out = validateInput('hevy_list_workouts', {});
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(10);
  });

  it('accepts valid UUID for hevy_get_workout', () => {
    expect(validateInput('hevy_get_workout', { workoutId: VALID_WORKOUT_UUID })).toEqual({
      workoutId: VALID_WORKOUT_UUID,
    });
  });

  it('accepts empty args for hevy_get_workout_count', () => {
    expect(validateInput('hevy_get_workout_count', {})).toEqual({});
  });

  it('accepts `since` on hevy_get_workout_events', () => {
    const out = validateInput('hevy_get_workout_events', {
      since: '2026-01-01T00:00:00Z',
      page: 1,
      pageSize: 5,
    });
    expect(out.since).toBe('2026-01-01T00:00:00Z');
    expect(out.pageSize).toBe(5);
  });

  it('accepts a valid workout for hevy_create_workout', () => {
    const args = { workout: validWorkoutBody() };
    expect(validateInput('hevy_create_workout', args).workout.title).toBe('Morning lift');
  });

  it('accepts a valid workout for hevy_update_workout', () => {
    const args = { workoutId: VALID_WORKOUT_UUID, workout: validWorkoutBody() };
    expect(validateInput('hevy_update_workout', args).workoutId).toBe(VALID_WORKOUT_UUID);
  });

  it('accepts pagination for hevy_list_routines', () => {
    const out = validateInput('hevy_list_routines', {});
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(10);
  });

  it('accepts a UUID for hevy_get_routine', () => {
    expect(validateInput('hevy_get_routine', { routineId: VALID_ROUTINE_UUID })).toEqual({
      routineId: VALID_ROUTINE_UUID,
    });
  });

  it('accepts a valid routine (with rep_range) for hevy_create_routine', () => {
    const body = validRoutineBody({
      exercises: [
        {
          exercise_template_id: BUILT_IN_TEMPLATE_ID,
          sets: [{ type: 'normal', reps: 8, rep_range: { start: 6, end: 10 } }],
        },
      ],
    });
    const args = { routine: body };
    expect(validateInput('hevy_create_routine', args).routine.title).toBe('Push day');
  });

  it('accepts hevy_update_routine', () => {
    const args = { routineId: VALID_ROUTINE_UUID, routine: validRoutineBody() };
    expect(validateInput('hevy_update_routine', args).routineId).toBe(VALID_ROUTINE_UUID);
  });

  it('accepts hevy_list_routine_folders', () => {
    const out = validateInput('hevy_list_routine_folders', { page: 2 });
    expect(out.page).toBe(2);
  });

  it('accepts a positive integer folderId for hevy_get_routine_folder', () => {
    expect(validateInput('hevy_get_routine_folder', { folderId: 42 })).toEqual({ folderId: 42 });
  });

  it('accepts a valid title for hevy_create_routine_folder', () => {
    expect(validateInput('hevy_create_routine_folder', { title: 'Push' })).toEqual({
      title: 'Push',
    });
  });

  it('accepts pageSize 100 for hevy_list_exercise_templates', () => {
    const out = validateInput('hevy_list_exercise_templates', { pageSize: 100 });
    expect(out.pageSize).toBe(100);
  });

  it('accepts both built-in and UUID ids for hevy_get_exercise_template', () => {
    expect(
      validateInput('hevy_get_exercise_template', { exerciseTemplateId: BUILT_IN_TEMPLATE_ID })
    ).toEqual({ exerciseTemplateId: BUILT_IN_TEMPLATE_ID });
    expect(
      validateInput('hevy_get_exercise_template', {
        exerciseTemplateId: VALID_CUSTOM_TEMPLATE_UUID,
      })
    ).toEqual({ exerciseTemplateId: VALID_CUSTOM_TEMPLATE_UUID });
  });

  it('accepts a valid custom exercise template for hevy_create_exercise_template', () => {
    const args = {
      exercise: {
        title: 'Safety-bar squat',
        type: 'weight_reps' as const,
        primary_muscle_group: 'quadriceps' as const,
        secondary_muscle_groups: ['glutes' as const],
        equipment_category: 'barbell' as const,
      },
    };
    expect(validateInput('hevy_create_exercise_template', args).exercise.title).toBe(
      'Safety-bar squat'
    );
  });

  it('accepts hevy_get_exercise_history', () => {
    expect(
      validateInput('hevy_get_exercise_history', {
        exerciseTemplateId: BUILT_IN_TEMPLATE_ID,
        page: 1,
        pageSize: 5,
      }).exerciseTemplateId
    ).toBe(BUILT_IN_TEMPLATE_ID);
  });

  it('accepts hevy_list_body_measurements', () => {
    const out = validateInput('hevy_list_body_measurements', {});
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(10);
  });

  it('accepts hevy_create_body_measurement', () => {
    const args = { date: '2026-04-19', weight_kg: 75.5 };
    expect(validateInput('hevy_create_body_measurement', args).date).toBe('2026-04-19');
  });

  it('accepts hevy_get_body_measurement', () => {
    expect(validateInput('hevy_get_body_measurement', { date: '2026-04-19' })).toEqual({
      date: '2026-04-19',
    });
  });

  it('accepts hevy_update_body_measurement', () => {
    const args = {
      date: '2026-04-19',
      body_measurement: { weight_kg: 75.1 },
    };
    expect(validateInput('hevy_update_body_measurement', args).date).toBe('2026-04-19');
  });
});

describe('validateInput — negative probes', () => {
  it('rejects unknown tool name', () => {
    expect(() =>
      validateInput('not_a_tool' as unknown as 'hevy_get_user_info', {})
    ).toThrow(ValidationError);
  });

  it('rejects hevy_create_exercise_template with 101-char title', () => {
    const args = {
      exercise: {
        title: 'x'.repeat(101),
        type: 'weight_reps' as const,
        primary_muscle_group: 'chest' as const,
      },
    };
    expect(() => validateInput('hevy_create_exercise_template', args)).toThrow(ValidationError);
  });

  it('accepts hevy_create_exercise_template with exactly 100-char title', () => {
    const args = {
      exercise: {
        title: 'x'.repeat(100),
        type: 'weight_reps' as const,
        primary_muscle_group: 'chest' as const,
      },
    };
    expect(validateInput('hevy_create_exercise_template', args).exercise.title.length).toBe(100);
  });

  it('rejects hevy_create_routine_folder with 300-char title', () => {
    expect(() =>
      validateInput('hevy_create_routine_folder', { title: 'x'.repeat(300) })
    ).toThrow(ValidationError);
  });

  it('rejects hevy_list_workouts with pageSize 0, 11, -1, and 5.5', () => {
    for (const pageSize of [0, 11, -1, 5.5]) {
      expect(() => validateInput('hevy_list_workouts', { pageSize })).toThrow(ValidationError);
    }
  });

  it('rejects hevy_list_exercise_templates with pageSize 101', () => {
    expect(() => validateInput('hevy_list_exercise_templates', { pageSize: 101 })).toThrow(
      ValidationError
    );
  });

  it('accepts hevy_list_exercise_templates with pageSize 100', () => {
    const out = validateInput('hevy_list_exercise_templates', { pageSize: 100 });
    expect(out.pageSize).toBe(100);
  });

  it('rejects hevy_create_workout with rpe 11', () => {
    const body = validWorkoutBody({
      exercises: [
        {
          exercise_template_id: BUILT_IN_TEMPLATE_ID,
          sets: [{ type: 'normal', reps: 5, rpe: 11 }],
        },
      ],
    });
    expect(() => validateInput('hevy_create_workout', { workout: body })).toThrow(ValidationError);
  });

  it('rejects hevy_create_workout with rpe 5.5', () => {
    const body = validWorkoutBody({
      exercises: [
        {
          exercise_template_id: BUILT_IN_TEMPLATE_ID,
          sets: [{ type: 'normal', reps: 5, rpe: 5.5 }],
        },
      ],
    });
    expect(() => validateInput('hevy_create_workout', { workout: body })).toThrow(ValidationError);
  });

  it('rejects hevy_create_workout with invalid set type', () => {
    const body = validWorkoutBody({
      exercises: [
        {
          exercise_template_id: BUILT_IN_TEMPLATE_ID,
          sets: [{ type: 'INVALID', reps: 5 }],
        },
      ],
    });
    expect(() => validateInput('hevy_create_workout', { workout: body })).toThrow(ValidationError);
  });

  it('rejects hevy_create_exercise_template with nonexistent muscle group', () => {
    const args = {
      exercise: {
        title: 'Squat',
        type: 'weight_reps' as const,
        primary_muscle_group: 'nonexistent' as unknown as 'chest',
      },
    };
    expect(() => validateInput('hevy_create_exercise_template', args)).toThrow(ValidationError);
  });

  it('rejects unknown field on POST body (strict schemas)', () => {
    const body = validWorkoutBody({ unexpected_key: 'x' });
    expect(() => validateInput('hevy_create_workout', { workout: body })).toThrow(ValidationError);
  });

  it('rejects unknown top-level key on a list tool', () => {
    expect(() =>
      validateInput('hevy_list_workouts', { page: 1, extra: 'nope' } as unknown as { page: 1 })
    ).toThrow(ValidationError);
  });

  it('rejects hevy_get_body_measurement with date 2099-99-99', () => {
    expect(() => validateInput('hevy_get_body_measurement', { date: '2099-99-99' })).toThrow(
      ValidationError
    );
  });

  it('rejects hevy_get_body_measurement with non-date string', () => {
    expect(() => validateInput('hevy_get_body_measurement', { date: 'not-a-date' })).toThrow(
      ValidationError
    );
  });

  it('rejects hevy_get_workout with a non-UUID workoutId', () => {
    expect(() => validateInput('hevy_get_workout', { workoutId: 'abc123' })).toThrow(
      ValidationError
    );
  });

  it('rejects hevy_create_routine with empty exercises array', () => {
    const args = { routine: validRoutineBody({ exercises: [] }) };
    expect(() => validateInput('hevy_create_routine', args)).toThrow(ValidationError);
  });

  it('rejects hevy_create_exercise_template with custom-only type floors_duration', () => {
    const args = {
      exercise: {
        title: 'Stairs',
        type: 'floors_duration' as unknown as 'weight_reps',
        primary_muscle_group: 'cardio' as const,
      },
    };
    expect(() => validateInput('hevy_create_exercise_template', args)).toThrow(ValidationError);
  });

  it('attaches details[] on ValidationError', () => {
    try {
      validateInput('hevy_get_body_measurement', { date: 'not-a-date' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
