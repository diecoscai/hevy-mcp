# Hevy API quirks — divergences and behaviors we verified empirically

The public OpenAPI spec at <https://api.hevyapp.com/docs/> identifies itself as version `0.0.1` and is maintained on a best-effort basis. We verified the real server behavior with `scripts/verify-api.sh` (re-runnable) and `tests/integration/hevy.int.test.ts` (read-only, skipped without `HEVY_API_KEY`).

This server implements what the **real** server accepts, not whatever the spec claims when they disagree.

Last verified: 2026-05-18.

## 1. `POST /v1/exercise_templates` body shape and field names

**What the spec says (incorrect):** wrap in `{ exercise_template: {...} }` with fields `{ type, primary_muscle_group, secondary_muscle_groups }`.

**What the server actually accepts:** wrap in `{ exercise: {...} }` with fields:
- `title` (required, 1–100 chars)
- `exercise_type` (required, enum — see §2)
- `muscle_group` (required, enum)
- `equipment_category` (required, enum — **the server treats this as required even though the OpenAPI listed it as optional**)
- `other_muscles` (optional, array of muscle_group values)

A POST with the spec wrapper or the spec field names returns HTTP 400 with a ZodError body.

**Fixed in v0.3.0** — see `src/validate.ts:exerciseTemplateCreateSchema` and `src/index.ts:hevy_create_exercise_template`. The pre-0.3.0 server could never successfully create a custom template.

## 2. `CustomExerciseType` enum

**Real server accepts (8 values):**
```
weight_reps, reps_only, bodyweight_reps, bodyweight_assisted_reps,
duration, weight_duration, distance_duration, short_distance_weight
```

Earlier versions of this MCP listed `bodyweight_weighted` and `bodyweight_assisted` — both rejected by the server. The spec was right; the MCP shipped invalid values that no one could ever submit. The MCP's `floors_duration` and `steps_duration` rejection is correct — those are built-in-only on the Hevy side.

**Fixed in v0.3.0** — see `src/validate.ts:CUSTOM_EXERCISE_TYPES`.

## 3. `PUT /v1/routines/{id}` rejects `folder_id`

**Spec says:** PUT body has no `folder_id`.

**Server confirms:** sending `folder_id` returns HTTP 400 `"routine.folder_id" is not allowed`.

The routine's folder cannot be changed via the public API. Pre-0.3.0 the MCP shared one schema between POST and PUT and let users submit `folder_id` on update — the server always rejected it.

**Fixed in v0.3.0** — `routineBodyCreateSchema` (POST) and `routineBodyUpdateSchema` (PUT) are now separate; PUT does not accept `folder_id`.

## 4. `routine.notes` rejects empty strings

The server returns HTTP 400 `"routine.notes" is not allowed to be empty` for `notes: ""`. The schema now enforces `minLength: 1` on notes and description so the client validation matches the server.

## 5. `GET /v1/exercise_history/{id}` accepts two query modes

The MCP exposes `page` and `pageSize`. The OpenAPI spec documents `start_date` and `end_date` (date-time). The real server accepts **both** independently — both return HTTP 200 with results.

The MCP today only exposes pagination. Adding `start_date`/`end_date` is a future enhancement, not a correctness fix.

## 6. `POST /v1/exercise_templates` response is plain text

A successful POST returns the new template id as a plain-text string (e.g. `d0778813-ce6b-4f40-a3ec-a9c0f254e3d3`), not JSON. Pre-0.3.0 the MCP always called `JSON.parse` and crashed with `UPSTREAM_ERROR: Unexpected non-whitespace character after JSON at position 1` even on success.

**Fixed in v0.3.0** — `hevyFetch` (`src/index.ts`) falls back to the raw text when the response is non-empty but not JSON.

## 7. `POST /v1/body_measurements` body shape

The spec says the body is flat — `{ date, weight_kg, ... }` — not wrapped. **Confirmed:** server returns HTTP 201 for a flat body. The MCP already sends flat (`src/index.ts`); no change needed in 0.3.0. (`PUT /v1/body_measurements/{date}` is asymmetric — the MCP input wraps in `body_measurement` for ergonomics, then the handler unwraps before sending, so the wire shape is flat too.)

## 8. `supersets_id` (response) vs `superset_id` (request)

The Hevy server uses the plural `supersets_id` in response bodies and the singular `superset_id` in request bodies. Any round-trip code (read → mutate → write) must rename. The MCP only ever writes `superset_id`, so callers who feed the read response back into a write must rename the key themselves.

This is a server quirk, not a fix on our side.

## 9. Response `Routine` does not include `notes`

The OpenAPI spec lists `notes` as a request-only field — confirmed in practice. POST/PUT accept it but GET does not return it. The MCP does not pretend otherwise; it forwards the upstream body verbatim.

---

## How to re-verify

Run with a valid Hevy Pro `api-key`:

```bash
HEVY_API_KEY=... bash scripts/verify-api.sh | tee /tmp/hevy-probe.log
```

Each probe prints its HTTP status. 2xx = the server accepts that shape; 4xx + a ZodError body = the server rejects. Update this file whenever a probe disagrees with what's documented above.

⚠️ The POST probes create real records (custom templates, body measurements) on the account associated with the key. The Hevy API has no DELETE endpoint, so you'll need to clean up the `_probe_*` titles manually in the Hevy app afterwards.
