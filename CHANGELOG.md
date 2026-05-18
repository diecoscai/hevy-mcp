# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-05-18

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

[Unreleased]: https://github.com/diecoscai/hevy-mcp/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/diecoscai/hevy-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/diecoscai/hevy-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/diecoscai/hevy-mcp/releases/tag/v0.1.0
