import { beforeAll, describe, expect, it } from 'vitest';
import {
  CUSTOM_EXERCISE_TYPES,
  EQUIPMENT_CATEGORIES,
  MUSCLE_GROUPS,
} from '../../src/validate.js';

// Live drift check: probes the Hevy server with deliberately-invalid enum
// values, parses the `options` array out of the 400 ZodError response, and
// asserts the MCP's three critical enums match what the server accepts.
//
// Skipped without HEVY_API_KEY. Every probe returns 400 — no records are
// created on the account. Guards against the failure mode that let four
// v0.3.0 schema bugs ship undetected for three months.

const BASE = 'https://api.hevyapp.com/v1';

interface ZodIssue {
  path?: string[];
  options?: unknown[];
}
interface ZodErrorBody {
  error?: { issues?: ZodIssue[] };
}

async function probeEnumOptions(
  body: Record<string, unknown>,
  fieldPath: string[]
): Promise<string[]> {
  const apiKey = process.env.HEVY_API_KEY;
  if (!apiKey) return [];
  const res = await fetch(`${BASE}/exercise_templates`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== 400) {
    throw new Error(`expected HTTP 400 from enum probe, got ${res.status}`);
  }
  const json = (await res.json()) as ZodErrorBody;
  const issue = json.error?.issues?.find(
    (i) =>
      Array.isArray(i.path) &&
      i.path.length === fieldPath.length &&
      i.path.every((p, idx) => p === fieldPath[idx])
  );
  if (!issue || !Array.isArray(issue.options)) {
    throw new Error(`no enum options found for ${fieldPath.join('.')}`);
  }
  return issue.options.map(String);
}

describe.skipIf(!process.env.HEVY_API_KEY)('live server enum drift', () => {
  let muscleGroups: string[] = [];
  let equipment: string[] = [];
  let exerciseTypes: string[] = [];

  beforeAll(async () => {
    muscleGroups = await probeEnumOptions(
      {
        exercise: {
          title: '_drift_probe',
          exercise_type: 'weight_reps',
          muscle_group: '__INVALID__',
          equipment_category: 'barbell',
        },
      },
      ['exercise', 'muscle_group']
    );
    equipment = await probeEnumOptions(
      {
        exercise: {
          title: '_drift_probe',
          exercise_type: 'weight_reps',
          muscle_group: 'chest',
          equipment_category: '__INVALID__',
        },
      },
      ['exercise', 'equipment_category']
    );
    exerciseTypes = await probeEnumOptions(
      {
        exercise: {
          title: '_drift_probe',
          exercise_type: '__INVALID__',
          muscle_group: 'chest',
          equipment_category: 'barbell',
        },
      },
      ['exercise', 'exercise_type']
    );
  }, 25000);

  it('MUSCLE_GROUPS matches the live server enum', () => {
    expect([...muscleGroups].sort()).toEqual([...MUSCLE_GROUPS].sort());
  });

  it('EQUIPMENT_CATEGORIES matches the live server enum', () => {
    expect([...equipment].sort()).toEqual([...EQUIPMENT_CATEGORIES].sort());
  });

  it('CUSTOM_EXERCISE_TYPES matches the live server enum', () => {
    expect([...exerciseTypes].sort()).toEqual([...CUSTOM_EXERCISE_TYPES].sort());
  });
});
