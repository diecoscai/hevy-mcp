# v0.5.0 Spec Generation — Progress

**Plan:** [PLAN.md](./PLAN.md)
**Status:** not started
**Branch:** _(to be created — `feat/v0.5.0`)_

## Task status

| # | Task | Status |
|---|------|--------|
| 1 | Vendor Hevy's OpenAPI spec + fetch script | pending |
| 2 | Scaffold kubb generation (scaffold + spike) | pending |
| 3 | Wire write-tool schemas to generated + overrides | pending |
| 4 | `hevy_search_exercise_templates` | pending |
| 5 | Scheduled workflows (spec-sync + integration) | pending |
| 6 | Docs: reposition, webhooks, maintenance mode | pending |
| 7 | Release v0.5.0 | pending |
| 8 | Publish to the MCP registry | pending |

## Log

_Record completions, deviations from the plan, and decisions here as tasks are executed._

## Open user actions

- Rotate the Hevy API key (the chat-pasted one is burned) and set it as a repo secret: `gh secret set HEVY_API_KEY --repo diecoscai/hevy-mcp` (needed for Task 5 `integration.yml`).
- MCP registry login is interactive (`mcp-publisher login github`) — Task 8 Step 3.
