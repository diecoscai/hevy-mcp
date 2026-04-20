# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `hevy_search_exercise_templates`: substring search over the full template
  catalog with optional primary-muscle-group filter. First call paginates the
  catalog once (pageSize=100, iterates page_count), dedupes concurrent fetches
  with an in-flight promise, and caches the result in the existing template
  cache. Subsequent searches filter in-memory. `refresh: true` forces a
  re-fetch. Also populates per-id cache entries as a side-effect so
  `hevy_get_exercise_template` lookups after a search are free.

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

[Unreleased]: https://github.com/diecoscai/hevy-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/diecoscai/hevy-mcp/releases/tag/v0.1.0
