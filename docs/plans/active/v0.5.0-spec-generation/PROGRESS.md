# v0.5.0 Spec Generation — Progress

**Plan:** [PLAN.md](./PLAN.md)
**Status:** in progress
**Branch:** `feat/v0.5.0`
**Execution:** subagent-driven-development — one implementer subagent per task,
two-stage review (spec compliance + code quality) after each.

## Task status

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Vendor Hevy's OpenAPI spec + fetch script | ✅ done | `cab435c` |
| 2 | Scaffold kubb generation (scaffold + spike) | ✅ done | `058d5bd` |
| 3 | Wire write-tool schemas to generated + overrides | ✅ done | `cda176c` |
| 4 | `hevy_search_exercise_templates` | 🔄 in progress | — |
| 5 | Scheduled workflows (spec-sync + integration) | pending | — |
| 6 | Docs: reposition, webhooks, maintenance mode | pending | — |
| 7 | Release v0.5.0 | pending | — |
| 8 | Publish to the MCP registry | pending | — |

## Log

- **Task 1** — fetch script + `openapi/hevy.json` vendored. Spec has 14 paths,
  28 component schemas (plan estimated ~20; harmless variance).
- **Task 2** — kubb scaffolded. Two deviations, both justified and recorded:
  (a) `kubb.config.ts` needs `extension: { '.ts': '.js' }` so generated imports
  satisfy Node16 ESM resolution; (b) `biome.json` force-excludes `src/generated`
  — generated code must not be linted. The plan's Task 2 only verified
  `npm run build`; `npm run check` was red on the 80 generated files until the
  biome exclude was added. Fix folded into the Task 2 commit.
- **Task 3** — **important finding, independently verified by the spec reviewer:**
  Hevy's OpenAPI spec marks nearly every request field `optional` and never
  models `required`, so the generated request-body objects accept `{}` as a
  valid workout/routine — too loose to be the validation source of truth.
  Per the plan's own decision rule ("durability over purity — partial
  generation that works beats full generation that fights the spec"), the
  outcome is **3 of 8 write tools wired to generated schemas, 5 hand-written**:
    - generated+override: `hevy_create_exercise_template` (enum fields),
      `hevy_create_body_measurement`, `hevy_update_body_measurement`.
    - hand-written (with inline comments): `hevy_create_workout`,
      `hevy_update_workout`, `hevy_create_routine`, `hevy_update_routine`,
      `hevy_create_routine_folder`.
  The durable signal generation carries well is the **enum value sets** —
  which IS the v0.3.0 bug class. `npm run generate` re-derives those on spec
  change. Object-required-ness was never the bug. Consequence for Tasks 6–7:
  the public "schemas generated from the spec" framing must be softened to be
  accurate (it is partial, and the real win is enum drift + the spec-sync /
  integration safety net).
- **Task 4** — in progress.

## Open user actions

- Rotate the Hevy API key (the chat-pasted one is burned) and set it as a repo
  secret: `gh secret set HEVY_API_KEY --repo diecoscai/hevy-mcp` (needed for
  Task 5 `integration.yml` to pass on scheduled runs; does not block the PR).
- MCP registry login is interactive (`mcp-publisher login github`) — Task 8
  Step 3 must be run by the user.
