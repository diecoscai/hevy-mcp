# Examples

Five end-to-end flows that exercise the 22 tools. Prompts are written for a chat-style client; the server does the same work if you call the tools directly.

All write flows below assume `HEVY_MCP_ALLOW_WRITES=1` is set. Without it, every `POST` / `PUT` returns a dry-run preview instead of hitting the Hevy API.

---

## 1. Log today's workout

Prompt:

> Log today's push workout: bench press 80kg x 5, 82.5kg x 5, 85kg x 3 (all normal sets), then overhead press 50kg x 8 x 3.

What the assistant does:

1. Calls `hevy_list_exercise_templates` with `pageSize: 100` to look up ids for "Bench Press (Barbell)" and "Overhead Press (Barbell)". Built-in templates have 8-char uppercase hex ids.
2. Calls `hevy_create_workout` with:

```json
{
  "workout": {
    "title": "Push Day",
    "start_time": "2026-04-19T09:00:00Z",
    "end_time": "2026-04-19T10:00:00Z",
    "exercises": [
      {
        "exercise_template_id": "79D0BB3A",
        "sets": [
          { "type": "normal", "weight_kg": 80,   "reps": 5 },
          { "type": "normal", "weight_kg": 82.5, "reps": 5 },
          { "type": "normal", "weight_kg": 85,   "reps": 3 }
        ]
      },
      {
        "exercise_template_id": "D04AC939",
        "sets": [
          { "type": "normal", "weight_kg": 50, "reps": 8 },
          { "type": "normal", "weight_kg": 50, "reps": 8 },
          { "type": "normal", "weight_kg": 50, "reps": 8 }
        ]
      }
    ]
  }
}
```

3. Returns the new workout's UUID to the user.

---

## 2. Pull the last 7 days of volume for an exercise

Prompt:

> How much bench press volume did I do in the last 7 days?

Flow:

1. `hevy_list_exercise_templates` — find the "Bench Press (Barbell)" id.
2. `hevy_get_exercise_history` with that id and `pageSize: 10`. The response is one row per set, newest first, regardless of warmup / normal / failure.
3. Filter rows where `workout.start_time >= now - 7d`.
4. Sum `weight_kg * reps` for `type === 'normal'` rows (skip warmups/dropsets unless the user asks for total tonnage).
5. Report: "Bench press over the last 7 days: 3 sessions, 18 working sets, 7 412 kg total tonnage."

---

## 3. Copy a shared routine into your account

Prompt:

> My coach shared routine `7b44d1e0-2d3b-4ee3-add3-b9f589df5b13` — copy it into my "Coaching" folder and strip the coach-only notes.

Flow:

1. `hevy_get_routine` with `routineId` — gets the full shape.
2. `hevy_list_routine_folders` to find the folder id for "Coaching", or `hevy_create_routine_folder` with `title: "Coaching"` if it doesn't exist.
3. `hevy_create_routine` with the fetched body, replacing `folder_id` and clearing `notes` on each exercise:

```json
{
  "routine": {
    "title": "Upper A (coach copy)",
    "folder_id": 42,
    "notes": "",
    "exercises": [
      {
        "exercise_template_id": "79D0BB3A",
        "rest_seconds": 120,
        "notes": "",
        "sets": [
          { "type": "normal", "rep_range": { "start": 5, "end": 8 } }
        ]
      }
    ]
  }
}
```

Note: `rep_range` is accepted only on routine sets (not workouts).

---

## 4. Bulk-export workout history

Prompt:

> Export every workout I've ever logged to a local CSV.

Flow:

1. `hevy_get_workout_count` — gives the total (say, 72).
2. Page through `hevy_list_workouts` with `pageSize: 10`, incrementing `page` until `page > page_count`.
3. For each page, iterate the `workouts[]` array — the list endpoint returns full workout bodies, so no per-id follow-up is needed.
4. Write rows to CSV client-side.

For incremental exports, remember the ISO timestamp of the most recent workout and use `hevy_get_workout_events` with `since` to fetch `updated` / `deleted` events instead of re-paginating.

---

## 5. Track bodyweight trend

Prompt:

> Log today's weigh-in (82.4 kg, 14% body fat) and plot my weight over the last 30 days.

Flow:

1. `hevy_create_body_measurement`:

```json
{
  "date": "2026-04-19",
  "weight_kg": 82.4,
  "fat_percent": 14.0
}
```

   If the server returns `409 Conflict`, the assistant falls back to `hevy_update_body_measurement` (remember: full replace — it must re-send every field it wants to preserve).

2. `hevy_list_body_measurements` with `pageSize: 10`, paging until covered 30 days.
3. Filter to rows within `now - 30d`, sort by `date`, and plot `weight_kg`.

---

## Dry-run preview

Any write flow can be run safely without `HEVY_MCP_ALLOW_WRITES=1`. The server returns:

```json
{
  "dry_run": true,
  "would_send": {
    "method": "POST",
    "path": "/v1/body_measurements",
    "body": { "date": "2026-04-19", "weight_kg": 82.4, "fat_percent": 14 }
  },
  "hint": "set HEVY_MCP_ALLOW_WRITES=1 to execute"
}
```

This is the recommended way to verify a multi-step flow before enabling writes.
