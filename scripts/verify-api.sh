#!/usr/bin/env bash
# Probe the real Hevy API to verify which schemas in src/validate.ts match
# the server's actual behavior (vs. what the OpenAPI doc claims).
# Reads HEVY_API_KEY from env. POSTs hit the real API — to keep this safe
# they use throwaway titles like "_probe_*"; you'll likely want to delete
# any custom templates created from the Hevy app after running.
#
# Usage: HEVY_API_KEY=... bash scripts/verify-api.sh

set -u
: "${HEVY_API_KEY:?set HEVY_API_KEY to a Hevy Pro key}"

BASE='https://api.hevyapp.com/v1'
H="api-key: ${HEVY_API_KEY}"
CT='content-type: application/json'

probe() {
  local label="$1" method="$2" path="$3" body="$4"
  echo "=== $label ==="
  echo "  $method $path"
  if [ -n "$body" ]; then
    echo "  body: $body"
  fi
  local code
  if [ -n "$body" ]; then
    code=$(curl -sS -o /tmp/hevy-probe-body.txt -w '%{http_code}' \
      -X "$method" "${BASE}${path}" -H "$H" -H "$CT" -d "$body")
  else
    code=$(curl -sS -o /tmp/hevy-probe-body.txt -w '%{http_code}' \
      -X "$method" "${BASE}${path}" -H "$H")
  fi
  echo "  -> HTTP $code"
  echo "  body: $(head -c 400 /tmp/hevy-probe-body.txt)"
  echo
}

echo "## Probe 1: exercise_templates field names (MCP names vs spec names)"
probe "MCP names (type/primary_muscle_group/secondary_muscle_groups)" \
  POST /exercise_templates \
  '{"exercise_template":{"title":"_probe_mcp","type":"weight_reps","primary_muscle_group":"chest","secondary_muscle_groups":["triceps"],"equipment_category":"barbell"}}'

probe "Spec names (exercise_type/muscle_group/other_muscles)" \
  POST /exercise_templates \
  '{"exercise_template":{"title":"_probe_spec","exercise_type":"weight_reps","muscle_group":"chest","other_muscles":["triceps"],"equipment_category":"barbell"}}'

echo "## Probe 2: CustomExerciseType enum"
probe "MCP value: bodyweight_weighted" \
  POST /exercise_templates \
  '{"exercise_template":{"title":"_probe_bw_weighted","type":"bodyweight_weighted","primary_muscle_group":"chest"}}'

probe "Spec value: weight_duration" \
  POST /exercise_templates \
  '{"exercise_template":{"title":"_probe_weight_duration","type":"weight_duration","primary_muscle_group":"chest"}}'

probe "MCP value: bodyweight_assisted" \
  POST /exercise_templates \
  '{"exercise_template":{"title":"_probe_bw_assisted","type":"bodyweight_assisted","primary_muscle_group":"chest"}}'

probe "Spec value: bodyweight_assisted_reps" \
  POST /exercise_templates \
  '{"exercise_template":{"title":"_probe_bw_assisted_reps","type":"bodyweight_assisted_reps","primary_muscle_group":"chest"}}'

echo "## Probe 3: exercise_history query params"
probe "MCP params: page/pageSize" \
  GET '/exercise_history/79D0BB3A?page=1&pageSize=2' ''
probe "Spec params: start_date/end_date" \
  GET '/exercise_history/79D0BB3A?start_date=2024-01-01T00:00:00Z&end_date=2024-12-31T23:59:59Z' ''

echo "## Probe 4: POST body_measurements wire shape (flat per spec)"
# Use 1970-01-02 as a safe past date to avoid clobbering real data on the
# user's account; if collision, we just see 409 and move on.
probe "Flat body" \
  POST /body_measurements \
  '{"date":"1970-01-02","weight_kg":80}'

echo "## Probe 5: PUT routines folder_id (spec says PUT does NOT accept folder_id)"
echo "  (skipping — requires an existing routine id; check manually if needed)"
echo

echo "Done. Read the HTTP codes + bodies above. 2xx = server accepts; 4xx = rejected."
echo "Remember: delete any '_probe_*' custom templates from the Hevy app afterwards."
