# v0.5.0 Spec Generation — Progress

**Plan:** [PLAN.md](./PLAN.md)
**Status:** ✅ complete — v0.5.0 shipped to npm and the MCP registry
**Feature doc:** [docs/features/spec-generation.md](../../../features/spec-generation.md)
**Execution:** subagent-driven-development — one implementer subagent per task,
two-stage review (spec compliance + code quality) after each, plus a final
holistic review of the whole branch.

## Task status

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Vendor Hevy's OpenAPI spec + fetch script | ✅ done | `cab435c` |
| 2 | Scaffold kubb generation (scaffold + spike) | ✅ done | `058d5bd` |
| 3 | Wire write-tool schemas to generated + overrides | ✅ done | `cda176c` |
| 4 | `hevy_search_exercise_templates` | ✅ done | `29930f5` |
| 5 | Scheduled workflows (spec-sync + integration) | ✅ done | `10c3131` |
| 6 | Docs: reposition, webhooks, maintenance mode | ✅ done | `9c765af` |
| 7 | Release v0.5.0 | ✅ done | `037045a` + tag `v0.5.0`, PR #7 |
| 8 | Publish to the MCP registry | ✅ done | `0115be1`, PR #8 |

Live: `npm view @diecoscai/hevy-mcp version` → `0.5.0` (OIDC trusted
publishing + provenance). MCP registry: `io.github.diecoscai/hevy-mcp`
version `0.5.0`, status `active`. GitHub release `v0.5.0` published.

## Log

- **Task 1** — fetch script + `openapi/hevy.json` vendored (14 paths, 28
  component schemas).
- **Task 2** — kubb scaffolded. Two justified deviations folded into the
  commit: `kubb.config.ts` needs `extension: { '.ts': '.js' }` for Node16
  ESM; `biome.json` force-excludes `src/generated` (the plan's Task 2 only
  checked `npm run build`, missing that `npm run check` was red on the 80
  generated files).
- **Task 3** — **key finding, independently verified:** Hevy's OpenAPI spec
  marks nearly every request field optional, so generated request-body
  objects accept `{}`. Per the plan's decision rule, outcome is **3 of 8
  write tools wired to generated schemas, 5 hand-written**. The durable win
  is the enum value sets (the v0.3.0 bug class).
- **Task 4** — `hevy_search_exercise_templates` (tool 23). Code-quality
  review added a `truncated` field for honest pagination-cap reporting.
- **Task 5** — `spec-sync.yml` + `integration.yml`. `spec-sync` was later
  dispatched manually and ran green (no drift → no PR).
- **Task 6** — public descriptions use the plan's "schemas generated from
  Hevy's OpenAPI spec" wording. An overstatement (5/8 hand-written); the
  project owner was shown the 3/8 reality and explicitly chose this
  framing. Accurate detail lives in the README "Spec ≠ reality" section,
  the `src/validate.ts` per-tool comments, and the feature doc.
- **Task 7** — versions → 0.5.0, CHANGELOG `[0.5.0]`, `docs/plans/**`
  excluded from the npm tarball. PR #7 merged after CI green on Node
  20/22/24. Final holistic review: no Critical issues; 2 Important fixes
  applied (tool 23 added to `docs/tools.md`; `truncated` path tested).
- **Task 8** — published via a new `publish-registry.yml` workflow using
  GitHub Actions OIDC (`mcp-publisher login github-oidc`) — no interactive
  device-flow login needed. `server.json` description trimmed 101 → 94
  chars to satisfy the registry's 100-char cap (PR #8).

## Open user actions (non-blocking)

- **`HEVY_API_KEY` repo secret** — rotate the burned key and
  `gh secret set HEVY_API_KEY --repo diecoscai/hevy-mcp` so the scheduled
  `integration.yml` can run. The integration suite skips without it.
