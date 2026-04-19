# Tool reference

Full schema + example for every tool the server exposes. Names mirror the underlying Hevy REST endpoints; input schemas are enforced client-side with Zod before any HTTP call.

All list endpoints return `{ page, page_count, <items> }`. All write endpoints (`POST` / `PUT`) return a `{ dry_run: true, would_send: ... }` preview unless `HEVY_MCP_ALLOW_WRITES=1` is set.

## Conventions

- **Enums** (copy verbatim):
  - `SetType`: `warmup | normal | failure | dropset`
  - `RPE`: `null | 6 | 7 | 7.5 | 8 | 8.5 | 9 | 9.5 | 10`
  - `MuscleGroup` (20): `abdominals, shoulders, biceps, triceps, forearms, quadriceps, hamstrings, calves, glutes, abductors, adductors, lats, upper_back, traps, lower_back, chest, cardio, neck, full_body, other`
  - `EquipmentCategory` (9): `none, barbell, dumbbell, kettlebell, machine, plate, resistance_band, suspension, other`
  - `ExerciseType` (custom, 8): `weight_reps, reps_only, duration, distance_duration, bodyweight_weighted, bodyweight_assisted, short_distance_weight, bodyweight_reps`. `floors_duration` and `steps_duration` are built-in only.
- **String caps**: `title ≤ 255`, `description ≤ 4096`, `notes ≤ 2048`. Custom exercise templates cap `title` at 100.
- **Pagination**: `pageSize` is `1-10` everywhere **except** `hevy_list_exercise_templates` (`1-100`). `page` is any positive integer.
- **IDs**:
  - `workoutId`, `routineId`: lowercase UUID v4.
  - `exerciseTemplateId`: 8-char uppercase hex (built-in) **or** lowercase UUID (custom).
  - `folderId`: positive integer.
- **Dates**: `YYYY-MM-DD` with calendar validation (no `2099-99-99`).
- **No DELETE endpoint exists on any resource.** Deletions only surface through `hevy_get_workout_events` (`deleted` events).

---

## User

### `hevy_get_user_info`

`GET /v1/user/info`. Returns the authenticated user.

Input schema: `{}` (no parameters).

Example response:

```json
{
  "data": {
    "id": "62704518-00ff-42c4-b618-c2c209cbbca7",
    "name": "Diego",
    "url": "https://hevy.com/user/<username>"
  }
}
```

---

## Workouts

### `hevy_list_workouts`

`GET /v1/workouts`. Newest-first.

Input schema:

```json
{
  "page": 1,
  "pageSize": 10
}
```

Example response:

```json
{
  "page": 1,
  "page_count": 8,
  "workouts": [
    {
      "id": "aa6b6d62-3857-45f2-97be-15db42638a59",
      "title": "Push Day",
      "start_time": "2026-04-18T09:00:00Z",
      "end_time": "2026-04-18T10:05:00Z",
      "exercises": [ /* ... */ ]
    }
  ]
}
```

### `hevy_get_workout`

`GET /v1/workouts/{workoutId}`.

Input schema:

```json
{ "workoutId": "aa6b6d62-3857-45f2-97be-15db42638a59" }
```

### `hevy_get_workout_count`

`GET /v1/workouts/count`.

```json
{ "workout_count": 72 }
```

### `hevy_get_workout_events`

`GET /v1/workouts/events`. Delta sync. Apply events in order.

Input schema:

```json
{
  "since": "2026-04-01T00:00:00Z",
  "page": 1,
  "pageSize": 10
}
```

Example event shapes:

```json
{ "type": "updated", "workout": { "id": "...", "title": "...", "exercises": [] } }
{ "type": "deleted", "payload": { "id": "...", "deleted_at": "2026-04-12T18:22:00Z" } }
```

### `hevy_create_workout`

`POST /v1/workouts`. Write — dry-run default.

Input schema:

```json
{
  "workout": {
    "title": "Push Day",
    "description": "felt strong",
    "start_time": "2026-04-18T09:00:00Z",
    "end_time":   "2026-04-18T10:05:00Z",
    "is_private": false,
    "exercises": [
      {
        "exercise_template_id": "79D0BB3A",
        "superset_id": null,
        "notes": "pause at chest",
        "sets": [
          { "type": "warmup", "weight_kg": 20, "reps": 10, "rpe": 6 },
          { "type": "normal", "weight_kg": 80, "reps": 5,  "rpe": 8 }
        ]
      }
    ]
  }
}
```

Notes: `rep_range` is **not** accepted on workout sets (routines only). Superset ids must be contiguous across adjacent exercises.

### `hevy_update_workout`

`PUT /v1/workouts/{workoutId}`. **Full replace** — any field not re-sent is dropped. Write — dry-run default.

```json
{
  "workoutId": "aa6b6d62-3857-45f2-97be-15db42638a59",
  "workout": { /* same shape as hevy_create_workout */ }
}
```

---

## Routines

### `hevy_list_routines`

`GET /v1/routines`. `pageSize 1-10`.

### `hevy_get_routine`

`GET /v1/routines/{routineId}`.

### `hevy_create_routine`

`POST /v1/routines`. Write — dry-run default.

Routine sets accept the same fields as workout sets **plus** `rep_range: { start, end }`.

```json
{
  "routine": {
    "title": "Upper A",
    "folder_id": 42,
    "notes": "2x/week",
    "exercises": [
      {
        "exercise_template_id": "79D0BB3A",
        "rest_seconds": 120,
        "sets": [
          { "type": "normal", "rep_range": { "start": 5, "end": 8 } }
        ]
      }
    ]
  }
}
```

### `hevy_update_routine`

`PUT /v1/routines/{routineId}`. Full replace. Write — dry-run default.

---

## Routine folders

### `hevy_list_routine_folders`

`GET /v1/routine_folders`.

### `hevy_get_routine_folder`

`GET /v1/routine_folders/{folderId}`. `folderId` is a positive integer.

### `hevy_create_routine_folder`

`POST /v1/routine_folders`. Write — dry-run default. Only accepts a `title`.

```json
{ "title": "Push days" }
```

The server always inserts new folders at index 0.

---

## Exercise templates

### `hevy_list_exercise_templates`

`GET /v1/exercise_templates`. **Only endpoint with `pageSize` up to 100.** Built-in ids are 8-char uppercase hex (e.g. `79D0BB3A`); custom ids are lowercase UUIDs.

### `hevy_get_exercise_template`

`GET /v1/exercise_templates/{id}`.

### `hevy_create_exercise_template`

`POST /v1/exercise_templates`. Write — dry-run default. `title ≤ 100`.

```json
{
  "exercise": {
    "title": "Front squat (custom)",
    "type": "weight_reps",
    "primary_muscle_group": "quadriceps",
    "secondary_muscle_groups": ["glutes", "lower_back"],
    "equipment_category": "barbell",
    "is_custom": true
  }
}
```

Allowed `type` values (custom templates): `weight_reps, reps_only, duration, distance_duration, bodyweight_weighted, bodyweight_assisted, short_distance_weight, bodyweight_reps`. `floors_duration` and `steps_duration` are built-in only and are rejected here.

### `hevy_get_exercise_history`

`GET /v1/exercise_history/{exerciseTemplateId}`. One row per logged set, includes warmups, failures, and dropsets.

```json
{
  "exerciseTemplateId": "79D0BB3A",
  "page": 1,
  "pageSize": 10
}
```

---

## Body measurements

Body measurements are keyed by **date**, not by id. There is no DELETE; once created, a date row stays until you overwrite it.

### `hevy_list_body_measurements`

`GET /v1/body_measurements`. Envelope `{ page, page_count, body_measurements }`.

### `hevy_get_body_measurement`

`GET /v1/body_measurements/{date}`. Returns HTTP 404 if no record exists.

```json
{ "date": "2026-04-18" }
```

### `hevy_create_body_measurement`

`POST /v1/body_measurements`. Write — dry-run default. Returns HTTP 409 if a record already exists for `date` (use `hevy_update_body_measurement` instead).

Quirk: the Hevy validator runs **before** auth on this endpoint, so a malformed body still returns `400` even without a valid api-key.

```json
{
  "date": "2026-04-18",
  "weight_kg": 82.4,
  "fat_percent": 14.2,
  "waist": 84
}
```

All metric fields are optional: `weight_kg, lean_mass_kg, fat_percent, neck_cm, shoulder_cm, chest_cm, left_bicep_cm, right_bicep_cm, left_forearm_cm, right_forearm_cm, abdomen, waist, hips, left_thigh, right_thigh, left_calf, right_calf`.

### `hevy_update_body_measurement`

`PUT /v1/body_measurements/{date}`. **Full replace — any field not sent is set to `NULL`.** There is no partial merge. Write — dry-run default.

```json
{
  "date": "2026-04-18",
  "body_measurement": {
    "weight_kg": 82.2,
    "fat_percent": 14.0
  }
}
```

---

## Error shape

Every tool returns SEP-1303-compliant errors:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "{\"error_code\":\"VALIDATION_ERROR\",\"message\":\"title: Too big: expected string to have <=255 characters\",\"details\":[...],\"hint\":\"fix the listed fields and retry; unknown keys are rejected\"}"
    }
  ]
}
```

Error codes: `VALIDATION_ERROR` (client-side Zod failure), `UPSTREAM_ERROR` (Hevy returned non-2xx), `UNKNOWN_TOOL`, `DRY_RUN`.
