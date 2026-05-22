# Spec generation & self-syncing CI (v0.5.0)

What v0.5.0 actually built. The plan lived at
`docs/plans/archive/v0.5.0-spec-generation/`.

## Goal

Make the project self-maintaining: instead of hand-writing request-body
schemas that silently drift from Hevy's API (the cause of the v0.3.0 bug
cluster), derive what can be derived from Hevy's OpenAPI spec, and add CI
that detects and adapts to upstream changes on its own.

## What shipped

### Code generation pipeline

- `scripts/fetch-spec.mjs` (`npm run fetch-spec`) — downloads Hevy's
  OpenAPI document (embedded in their Swagger UI bundle) and vendors it
  to `openapi/hevy.json`. That committed copy is both the generation
  input and the drift baseline.
- `kubb.config.ts` (`npm run generate`) — runs [kubb](https://kubb.dev/)
  with the OAS + Zod plugins only (no generated HTTP client — `hevyFetch`
  stays — and no mocks). Output: Zod schemas under `src/generated/`.
  `extension: { '.ts': '.js' }` keeps generated imports compatible with
  the project's Node16 ESM resolution.
- `src/generated/**` is committed (so the npm package and drift PRs
  include it) and force-excluded from `biome check` — generated code is
  not hand-maintained.

### What is generated vs hand-written

Hevy's OpenAPI spec marks nearly every request field `optional` and never
models `required`, so the generated request-body objects accept `{}` as a
valid workout or routine — too loose to be the validation source of truth.
The refactor follows a durability-over-purity rule:

- **Generated** — the enum value sets (`exercise_type`, `muscle_group`,
  `equipment_category`) and the body-measurement metric fields. The enum
  sets are exactly the v0.3.0 bug class; they are now re-derived by
  `npm run generate` and cannot silently drift.
- **Hand-written** (with inline rationale in `src/validate.ts`) — the
  object structure of the workout / routine / routine-folder write tools,
  because the spec models them too loosely. 3 of 8 write tools are wired
  to generated schemas; 5 stay hand-written.
- `src/schemas/overrides.ts` — a thin layer re-applying behaviors the
  spec omits but the live server enforces: empty-string rejection on
  `notes`/`description`, and strict unknown-key rejection.
- The 15 read-tool schemas (page / id / date inputs) were left unchanged
  — they never drift.

### New tool

- `hevy_search_exercise_templates` (tool 23) — resolves an
  `exercise_template_id` from a human name. Paginates the catalog
  (reusing the existing template cache), filters titles by a
  case-insensitive substring, and returns
  `{ query, total_matches, exercise_templates, truncated }`. The scan is
  capped at 30 pages of 100; `truncated` reports when `total_matches` is
  a lower bound.

### Self-syncing CI

- `.github/workflows/spec-sync.yml` (Mondays 05:00 UTC) — re-fetches the
  spec, regenerates, and opens a PR if anything changed. Adapts to
  changes Hevy **documents**.
- `.github/workflows/integration.yml` (Mondays 06:00 UTC) — runs the
  live integration suite against Hevy's API. Catches changes Hevy ships
  **without** updating its spec. Needs a `HEVY_API_KEY` repo secret; the
  suite skips without it.
- `.github/workflows/publish-registry.yml` (`workflow_dispatch`) —
  publishes `server.json` to the MCP registry via GitHub Actions OIDC
  (`mcp-publisher login github-oidc`), no interactive login.

## Result

`@diecoscai/hevy-mcp@0.5.0` — 23 tools, published to npm with provenance
and listed in the MCP registry as `io.github.diecoscai/hevy-mcp`. The
project is in maintenance mode: the next change should come from a
`spec-sync` PR, a failed `integration` run, or a real user issue.

## Honest limitations

- "Schemas generated from Hevy's OpenAPI spec" (package / registry
  description) is the headline framing; in practice generation covers the
  enum layer and 3 of 8 write tools. The durability guarantee is real for
  enum drift — the class that actually caused v0.3.0 — but write-tool
  object structure is still hand-maintained. The README "Spec ≠ reality"
  section and the per-tool comments in `src/validate.ts` carry the
  precise picture.
- Generation adapts to changes Hevy **documents**. Undocumented
  spec-vs-server drift is covered only by the live `integration` run.
