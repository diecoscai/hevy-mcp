# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-05-22

The last large release. v0.5.0 makes the project self-maintaining: it
adopts code generation from Hevy's OpenAPI spec, adds a search tool,
and closes the loop with two scheduled workflows that detect and adapt
to upstream changes. After this, the project moves to maintenance mode.

### Added

- **`hevy_search_exercise_templates`** (tool 23). Resolves an
  `exercise_template_id` from a human name — paginates the
  built-in + custom catalog and filters titles by a case-insensitive
  substring. Returns `{ query, total_matches, exercise_templates,
  truncated }`. The scan is capped at 30 pages of 100; `truncated`
  reports when a larger catalog made `total_matches` a lower bound.
- **Code generation from Hevy's OpenAPI spec.** `npm run fetch-spec`
  vendors Hevy's spec to `openapi/hevy.json`; `npm run generate` runs
  [kubb](https://kubb.dev/) to emit Zod schemas under `src/generated/`.
- **Scheduled `spec-sync` workflow** (Mondays 05:00 UTC). Re-fetches
  Hevy's spec, regenerates schemas, and opens a PR if anything changed
  — the project adapts to documented API changes without hand-editing.
- **Scheduled `integration` workflow** (Mondays 06:00 UTC). Runs the
  live integration suite against Hevy's API to catch changes Hevy
  ships *without* updating its spec.

### Changed

- **Write-tool validation is sourced from Hevy's OpenAPI spec.** The
  schemas that produced the v0.3.0 bug cluster — the enum value sets
  for exercise type, muscle group, and equipment category — are now
  generated from the spec and re-derived on every `npm run generate`,
  so they cannot silently drift again. A thin `src/schemas/overrides.ts`
  layer re-applies the documented quirks the spec omits (empty-string
  rejection, strict unknown-key rejection). Workout / routine object
  structure stays hand-written because Hevy's spec models every request
  field as optional — see the per-tool notes in `src/validate.ts` and
  `docs/api-quirks.md`. The 15 read-tool schemas are unchanged.
- **Repositioned.** The package and registry descriptions, and the
  README, now lead with spec-generation and self-syncing CI. A new
  README "Project status" section marks the project as feature-complete
  for Hevy's public API and in maintenance mode.

## [0.4.1] - 2026-05-20

### Security

Hardening from an independent security review of v0.4.0. The review
found **no Critical or High issues**; these address the Medium and Low
findings.

- **Request timeouts.** `hevyFetch` (30 s) and the `setup` key check
  (15 s) now bound every HTTP request with `AbortSignal.timeout`. A
  hung or slow Hevy upstream can no longer stall an MCP call — or the
  client waiting on it — indefinitely. (Medium)
- **URL-escaped path parameters.** Workout / routine / folder /
  exercise-template ids and dates are `encodeURIComponent`-escaped
  before being interpolated into request paths. The strict Zod schemas
  already made injection impossible; this is defense in depth. (Low)
- **Config directory permissions.** `~/.config/hevy-mcp` is now created
  with `0700`, and `writeUserConfig` re-applies `0600` to the config
  file on overwrite (Node's `writeFileSync` mode only applies on
  creation). (Low)

## [0.4.0] - 2026-05-20

### Behavior changes (read before upgrading)

- **Plain-text upstream responses now pass through as raw text.** v0.3.0
  JSON-stringified every result, so the bare id returned by
  `POST /v1/exercise_templates` arrived as `text: "\"<uuid>\""` (literal
  quote characters). v0.4.0 passes string results through unchanged.
  Callers that did `JSON.parse(content[0].text)` on the
  `hevy_create_exercise_template` response should drop the parse step.
  Every other tool returns JSON and is unaffected.

### Added

- **`setup` subcommand** — `npx @diecoscai/hevy-mcp setup` runs an
  interactive flow: prompts for the API key, validates it live against
  `GET /v1/user/info`, asks whether to enable writes, and saves
  everything to `~/.config/hevy-mcp/config.json` (mode `0600`). After
  setup the MCP client entry needs no `env` block at all.
- **On-disk config file.** The server reads `apiKey` and `allowWrites`
  from `$XDG_CONFIG_HOME/hevy-mcp/config.json` when the matching env var
  is absent. Environment variables always take precedence, so an MCP
  client's `env` block can still override either value.
- `hevy_get_exercise_history` accepts two optional ISO-8601 datetime
  query params, `start_date` and `end_date`, combinable with pagination.
- `tests/integration/server-enums.int.test.ts` — live enum drift check
  that asserts the MCP's `MUSCLE_GROUPS`, `EQUIPMENT_CATEGORIES`, and
  `CUSTOM_EXERCISE_TYPES` match what the Hevy server accepts. Skipped
  without `HEVY_API_KEY`.

### Changed

- The CallTool envelope emits string dispatch results as raw text
  instead of JSON-stringifying them (see Behavior changes).
- `hevy_get_exercise_history` description documents the date-range mode.
- `MissingCredentialsError` message mentions the `setup` subcommand.
- README, `docs/configuration.md`, and `docs/api-quirks.md` document the
  `setup` flow, the config file, and the env-var precedence rule.

### Internal

- CI matrix now covers Node 20 / 22 / 24; `actions/checkout` and
  `actions/setup-node` bumped to v5 (Node 20 actions are deprecated).

## [0.3.0] - 2026-05-20

### Behavior changes (read before upgrading)

- **`notes` and `description` no longer accept empty strings.** v0.2.0
  forwarded `notes: ""` to Hevy, which returned HTTP 400 with an
  informative body. v0.3.0 rejects empty strings locally as a
  `VALIDATION_ERROR` instead. Callers that previously cleared a notes
  field by sending `""` should omit the field entirely (the Hevy public
  API has no way to clear an existing `notes` value — this MCP can only
  send a non-empty replacement or skip the field on update).
- **`hevy_update_routine` no longer accepts `folder_id`.** Sending it
  now fails locally as `VALIDATION_ERROR`. Pre-0.3.0 it failed at
  Hevy with HTTP 400 (`"routine.folder_id" is not allowed`). The
  routine's folder still cannot be changed via the public API.
- **`dryRunResult` payload shape changed.** A new `executed: false`
  field is included alongside `dry_run: true`. Existing fields are
  unchanged; the `hint` text is more directive.

### Fixed

- `hevy_create_exercise_template` could never successfully create a template
  before this release. Every attempt returned HTTP 400 silently because the
  MCP shipped the wrong wire shape (`exercise_template` wrapper instead of
  `exercise`) and wrong field names (`type`, `primary_muscle_group`,
  `secondary_muscle_groups` instead of `exercise_type`, `muscle_group`,
  `other_muscles`). Confirmed against the live Hevy API and now matches the
  real server behavior. See [`docs/api-quirks.md`](./docs/api-quirks.md).
- `CUSTOM_EXERCISE_TYPES` enum: replaced two bogus values
  (`bodyweight_weighted`, `bodyweight_assisted`) with the real ones the
  server accepts (`weight_duration`, `bodyweight_assisted_reps`).
- `hevy_update_routine` no longer accepts `folder_id`. The Hevy API rejects
  it with HTTP 400; the MCP now validates it out client-side. `POST` still
  accepts `folder_id` as before.
- `notes` and `description` schemas now enforce `minLength: 1`. The Hevy
  server rejects empty strings with a 400; previously the MCP let users
  submit `""` and crashed at the upstream.
- `hevyFetch` no longer crashes when an endpoint returns plain text on
  success. `POST /v1/exercise_templates` returns the new id as a bare
  string (not JSON); the response is now surfaced verbatim instead of
  raising an `UPSTREAM_ERROR` "Unexpected non-whitespace character".
- Closed all transitive `npm audit` advisories (high `fast-uri`, moderate
  `hono` / `ip-address` / `express-rate-limit`) by bumping the SDK within
  its `^1.0.0` range.

### Added

- [`docs/api-quirks.md`](./docs/api-quirks.md) — confirmed divergences
  between the public OpenAPI spec and the live server, with
  `scripts/verify-api.sh` to re-verify any time.
- [`SECURITY.md`](./SECURITY.md) at the repo root so GitHub's Security tab
  links to it natively.
- CI status badge in the [README](./README.md).
- Provenance attestations on every npm publish (`--provenance` in
  `release.yml`, `publishConfig.provenance: true` in `package.json`). The
  sigstore badge shows on npmjs.com.
- `hintFor` in `src/errors.ts` now inspects upstream response bodies to
  distinguish "no Pro subscription" from "invalid api-key" on HTTP 401,
  and emits a specific hint for HTTP 403 limit-reached and HTTP 429.
- `dryRunResult` payload now includes `executed: false` and a more
  actionable hint pointing the LLM at the user's MCP client config.
- Regression tests asserting the wire shape for `POST` body_measurements
  (flat), `PUT` body_measurements (only metrics, date in URL), and `POST`
  exercise_templates (wrapped in `exercise`). The nock test preload now
  supports `bodyEquals` and `bodyContains` matchers.

### Changed

- Tool descriptions in `src/index.ts` rewritten for LLM-facing UX:
  - Write tools that need an `exercise_template_id` now name the lookup
    tool (`hevy_list_exercise_templates` / `hevy_get_exercise_template`)
    explicitly so the LLM does the lookup before composing a write.
  - `hevy_list_workouts` is differentiated from `hevy_get_workout` and
    `hevy_get_workout_count` in plain language.
  - `hevy_get_workout_events` ships a concrete incremental-sync recipe
    instead of an abstract "delta sync" label.
  - `hevy_update_body_measurement` calls out FULL REPLACE behavior
    explicitly with a get-modify-send recipe.
  - `hevy_update_routine` warns that `folder_id` is rejected.
  - `hevy_create_body_measurement` drops an unactionable quirk sentence.
  - Dry-run gate wording is uniform across all 8 write tools.
- `MissingCredentialsError` message mentions the Hevy Pro requirement and
  that the key belongs in the MCP client's env block.
- `docs/examples.md` gains a "How write tools resolve exercises" overview
  and the dry-run preview shows the new payload shape.
- `docs/configuration.md` gains a consolidated First-run troubleshooting
  section covering the five most common failure modes.
- README: new "Spec ≠ reality" section linking the quirks doc; removed
  the stale "while the npm package is being published" note.

### Internal

- `PROGRESS.md` is no longer tracked in the public repo (gitignored).
- Release workflow guards against version/tag mismatch before publish and
  runs the full build + test gate.
- `tests/helpers/nockPreload.mjs` extended with order-insensitive
  `bodyEquals` and `bodyContains` matching.

## [0.2.0] - 2026-04-19

### Added

- In-memory TTL cache for `hevy_list_exercise_templates` and
  `hevy_get_exercise_template`. Default TTL 1h, opt-out via
  `HEVY_MCP_DISABLE_CACHE=1`, custom TTL via `HEVY_MCP_CACHE_TTL_SECONDS`.
  `hevy_create_exercise_template` invalidates the list portion of the
  cache on success.
- README sections documenting the cache and explaining the deliberate
  absence of webhook tools.

## [0.1.0] - 2026-04-19

Initial public release.

### Added

- 22 tools covering 100% of the public Hevy API (`api.hevyapp.com/v1`):
  user info, workouts (list / get / count / events / create / update),
  routines (list / get / create / update), routine folders (list / get / create),
  exercise templates (list / get / create / get history), and body measurements
  (list / get / create / update).
- Single-env-var authentication: set `HEVY_API_KEY` in your MCP client's
  `env` block and the server is ready. No config file, no cache, no wizard.
- Dry-run writes by default. `POST` / `PUT` tools return a
  `{ dry_run: true, would_send: { ... } }` preview unless
  `HEVY_MCP_ALLOW_WRITES=1` is set.
- Client-side validation with Zod: `title <= 255`, `description <= 4096`,
  `notes <= 2048`, `pageSize` clamped to `[1, 10]` (or `[1, 100]` for
  `hevy_list_exercise_templates`), `SetType`, `RPE`, `MuscleGroup`,
  `EquipmentCategory`, and `ExerciseType` enums, strict calendar-validated
  `YYYY-MM-DD` dates, UUID format on ids, and `.strict()` on every object
  schema so unknown keys are rejected before any HTTP call.
- SEP-1303-compliant error envelope for every validation or upstream
  failure: `{ isError: true, content: [{ type: 'text', text:
  JSON.stringify({ error_code, message, details?, hint? }) }] }`.
- MCP Inspector integration via `npm run inspect`.
- CLI commands: `--help`, `--version`. Server version is read from
  `package.json` at runtime rather than hardcoded.
- README with copy-paste configuration snippets for Claude Desktop,
  Claude Code CLI, Cursor, and VS Code, plus overflow docs under
  `docs/` (tool reference, configuration, examples, security).
- GitHub Actions workflows: `ci.yml` (build + lint + test on Node 20
  and 22) and `release.yml` (publish to npm on `v*` tags).
- `server.json` manifest for the MCP registry
  (`io.github.diecoscai/hevy-mcp`).

### Security

- Dry-run default prevents accidental writes to an API with no `DELETE`
  endpoint (no rollback possible from the client).
- The server writes nothing to disk — credentials live only in your MCP
  client's config, where you already control access.
- Bumped transitive `hono` to `4.12.14` to clear GHSA-458j-xx4x-4375
  (moderate: JSX SSR HTML injection). The SDK's peer range accepts the
  fix without a breaking bump.

[Unreleased]: https://github.com/diecoscai/hevy-mcp/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/diecoscai/hevy-mcp/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/diecoscai/hevy-mcp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/diecoscai/hevy-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/diecoscai/hevy-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/diecoscai/hevy-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/diecoscai/hevy-mcp/releases/tag/v0.1.0
