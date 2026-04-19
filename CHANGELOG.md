# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-19

Initial public release.

### Added

- 22 tools covering 100% of the public Hevy API (`api.hevyapp.com/v1`):
  user info, workouts (list / get / count / events / create / update),
  routines (list / get / create / update), routine folders (list / get / create),
  exercise templates (list / get / create / get history), and body measurements
  (list / get / create / update).
- First-run setup flow: `npx @diecoscai/hevy-mcp setup` prompts for the Hevy
  Pro API key, probes `GET /v1/user/info` to validate it, and writes
  `$XDG_CONFIG_HOME/hevy-mcp/config.json` with mode `0600`.
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
- CLI commands: `--help`, `--version`, `setup`. Server version is read
  from `package.json` at runtime rather than hardcoded.
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
- Stored config is `mode 0600` in a `mode 0700` directory; env-var path
  (`HEVY_API_KEY`) avoids on-disk storage entirely.
- Bumped transitive `hono` to `4.12.14` to clear GHSA-458j-xx4x-4375
  (moderate: JSX SSR HTML injection). The SDK's peer range accepts the
  fix without a breaking bump.

[Unreleased]: https://github.com/diecoscai/hevy-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/diecoscai/hevy-mcp/releases/tag/v0.1.0
