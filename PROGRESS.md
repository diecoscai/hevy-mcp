# hevy-mcp — publication roadmap

Shared checklist for the 4-role agent team (planner, builder, QA, verifier).
All artifacts and items are English-only.

## Target
Publish **@diecoscai/hevy-mcp** to npm + **io.github.diecoscai/hevy-mcp** to the MCP
registry, with 100% public-API coverage, SEP-1303-compliant errors, dry-run
writes, tests, lint, and CI. Final tool count: **22** (current 18 + 4 new
body_measurements tools).

## Status
- [ ] Phase A — Hardening  (not started)
- [ ] Phase B — Publication (blocked on Phase A)

---

## Phase A — Hardening

Branch: `feat/hardening`. Builder works here; verifier audit closes the phase.
Items are ordered by dependency — do not reorder.

- [x] **A1 — Git init.** Create `/home/dieco/dev/hevy-mcp/.gitignore` with
      `node_modules/`, `dist/`, `.env`, `*.log`, `tests/__cache__/`. Run
      `git init -b main`, `git add -A`, initial commit
      `chore: initial commit — hevy-mcp baseline`, then
      `git checkout -b feat/hardening`.
- [x] **A2 — `LICENSE` (MIT)** at repo root with `Copyright (c) 2026 Diego Iscai`.
- [x] **A3 — `README.md` skeleton** (one-paragraph placeholder — the full
      README is Phase B item B3).
- [x] **A4 — Dev dependencies.** `npm install --save zod`,
      `npm install --save-dev vitest @vitest/coverage-v8 ajv ajv-formats nock
      @biomejs/biome`. Update `package.json` scripts: `test`, `lint`, `check`,
      `format`, `smoke`. (Depends on A1.)
- [ ] **A5 — `src/validate.ts`.** Define Zod schemas for every tool input.
      Exports `validateInput(toolName, args): T` and throws `ValidationError`.
      Includes these literal enum constants (do NOT guess — copy verbatim):
      - `SetType = ['warmup', 'normal', 'failure', 'dropset']`
      - `RPE = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10]` (nullable)
      - `MuscleGroup = ['abdominals','shoulders','biceps','triceps','forearms',
        'quadriceps','hamstrings','calves','glutes','abductors','adductors',
        'lats','upper_back','traps','lower_back','chest','cardio','neck',
        'full_body','other']` (20 values)
      - `EquipmentCategory = ['none','barbell','dumbbell','kettlebell','machine',
        'plate','resistance_band','suspension','other']` (9 values)
      - `ExerciseType = ['weight_reps','reps_only','duration','distance_duration',
        'bodyweight_weighted','bodyweight_assisted','short_distance_weight',
        'floors_duration','steps_duration']` (+ alias `bodyweight_reps` read-only)
      - Per docs, `customExericseTypes` (for `POST /v1/exercise_templates`)
        excludes `floors_duration` and `steps_duration`.
      - Strings: `title ≤ 255`, `description ≤ 4096`, `notes ≤ 2048`.
      - `pageSize`: integer `[1, 10]` everywhere **except**
        `hevy_list_exercise_templates` which is `[1, 100]`.
      - `page`: integer `≥ 1`.
      - `date` path param: strict `YYYY-MM-DD` with calendar validation
        (reject `2099-99-99`).
      - UUID format on `workoutId`, `routineId`, `exerciseTemplateId`,
        `exercise_template_id`. `folderId` is a positive integer.
      - `.strict()` on every object schema → unknown keys reject.
- [ ] **A6 — `src/errors.ts`.** Define `ValidationError`, `HevyApiError`,
      and `toToolExecutionError(err)` returning a single SEP-1303 shape:
      `{ isError: true, content: [{ type: 'text', text: JSON.stringify({
      error_code, message, details?, hint? }) }] }`. Error codes:
      `VALIDATION_ERROR`, `UPSTREAM_ERROR`, `DRY_RUN`, `UNKNOWN_TOOL`.
      Messages are LLM-actionable (e.g. `"title must be ≤ 255 chars; got 300"`).
- [ ] **A7 — Wire validation + SEP-1303 errors into `src/index.ts`.** Every
      tool handler calls `validateInput(name, args)` before touching the
      network. Any thrown error routes through `toToolExecutionError`.
      Remove the legacy `Error: ${message}` pass-through.
- [ ] **A8 — Dry-run safety.** Read `HEVY_MCP_ALLOW_WRITES` once at boot.
      Wrap every `POST`/`PUT` tool handler: when unset, return
      `{ dry_run: true, would_send: { method, path, body }, hint: "set
      HEVY_MCP_ALLOW_WRITES=1 to execute" }` as a normal (non-error)
      tool result. Document in every write-tool description.
- [ ] **A9 — Clamp `pageSize` in handlers.** After A5 validation, pass the
      clamped value through to `hevyFetch`. The current code forwards any
      number and surfaces the server's 400 — fix in every list handler:
      `hevy_list_workouts`, `hevy_list_routines`, `hevy_list_routine_folders`,
      `hevy_list_exercise_templates` (cap 100), `hevy_get_workout_events`,
      `hevy_get_exercise_history`, and the new `hevy_list_body_measurements`.
- [ ] **A10 — Add `hevy_list_body_measurements`.** `GET /v1/body_measurements`,
      params `page` (≥1), `pageSize` (1–10). Response envelope
      `{ page, page_count, body_measurements: [] }`.
- [ ] **A11 — Add `hevy_create_body_measurement`.** `POST /v1/body_measurements`.
      Required field: `date` (`YYYY-MM-DD`). All 17 metric fields optional:
      `weight_kg`, `lean_mass_kg`, `fat_percent`, `neck_cm`, `shoulder_cm`,
      `chest_cm`, `left_bicep_cm`, `right_bicep_cm`, `left_forearm_cm`,
      `right_forearm_cm`, `abdomen`, `waist`, `hips`, `left_thigh`,
      `right_thigh`, `left_calf`, `right_calf`. Description must flag the
      409-on-duplicate-date behaviour and the validator-before-auth quirk.
      Covered by dry-run (A8).
- [ ] **A12 — Add `hevy_get_body_measurement`.** `GET /v1/body_measurements/{date}`.
      Required: `date` (`YYYY-MM-DD`, strict). Description notes 404 on
      missing date.
- [ ] **A13 — Add `hevy_update_body_measurement`.** `PUT /v1/body_measurements/{date}`.
      Required: `date` + a `body_measurement` object. Description MUST state
      "full replace — any field not sent is set to NULL" (no partial merge).
      Covered by dry-run (A8).
- [ ] **A14 — Enrich every tool description** using the specs at
      `/home/dieco/dev/hobby/hevy-scrap/docs/features/*.md`. Each description
      ≤ 1024 chars, English only. Must mention, where relevant:
      literal enum lists (RPE, SetType, MuscleGroup, EquipmentCategory,
      ExerciseType), `pageSize ≤ 10` (100 for exercise_templates),
      "no DELETE exists on any resource", superset contiguity,
      `rep_range` is routines-only (not workouts), body_measurements keyed
      by date with PUT-replace semantics, and the dry-run flag for writes.
- [ ] **A15 — Version from `package.json`.** Replace the hardcoded
      `version: '1.0.0'` in `new Server({...})` with a read from
      `package.json` (via `createRequire` or a build-time inline). Same for
      `name`.
- [ ] **A16 — Biome config.** `biome.json` with 2-space indent, single
      quotes, `organizeImports` on. Scripts: `lint`, `check`, `format`.
- [ ] **A17 — QA: smoke test.** `scripts/smoke.sh`: `npm ci && npm run build
      && npm test && npm run lint`, then spawn `node dist/index.js`, send
      `initialize` + `tools/list`, assert `tools.length === 22` and every
      `inputSchema` validates under `ajv` as JSON Schema Draft 2020-12.
- [ ] **A18 — QA: unit tests.** `tests/validate.test.ts` covering happy
      paths + negative probes (oversized title, unknown field, bad enum,
      `pageSize=11`, malformed date, RPE=11, unknown set type). Target
      ≥ 80% line coverage on `src/validate.ts` and `src/errors.ts`.
- [ ] **A19 — QA: integration tests.** `tests/integration/*.test.ts`
      reading real `api.hevyapp.com` when `HEVY_API_KEY` is set (skip
      otherwise). Writes intercepted with `nock`. Covers: `get_user_info`,
      `list_workouts`, `get_workout`, `list_body_measurements`.
- [ ] **A20 — QA: language gate.** A repo-wide script (in `scripts/smoke.sh`)
      greps for Spanish markers (accented vowels `[áéíóúñ¿¡]` outside string
      literals, common Spanish words) across all user-facing files and fails
      on any hit.

---

## Phase B — Publication

Branch: `feat/publication`. Builder does everything up to publish; the user
runs the two user-gated publish commands at the end.

- [ ] **B1 — User confirms npm name.** Default `@diecoscai/hevy-mcp` (scoped,
      since `hevy-mcp` unscoped is taken by chrisdoc/hevy-mcp on npm — 150
      releases, active). No action required if user accepts default.
- [ ] **B2 — `package.json` polish.** Set `name: "@diecoscai/hevy-mcp"`,
      `version: "0.1.0"`, `description`, `bin: { "hevy-mcp":
      "dist/index.js" }`, `files: ["dist/**", "README.md", "LICENSE",
      "CHANGELOG.md"]`, `prepublishOnly: "npm run build"`,
      `keywords: ["mcp","hevy","fitness","workout","claude","llm"]`,
      `repository: { type: "git", url: "https://github.com/diecoscai/hevy-mcp.git" }`,
      `homepage`, `bugs`, `author: "Diego Iscai <diecoscai@gmail.com>"`,
      `license: "MIT"`, `engines: { node: ">=20" }`,
      `mcpName: "io.github.diecoscai/hevy-mcp"`. (Depends on B1.)
- [ ] **B3 — Shebang.** First line of `src/index.ts` becomes
      `#!/usr/bin/env node`. Ensure `tsc` preserves it (banner config if
      needed), and `chmod +x dist/index.js` in the build step.
- [ ] **B4 — Full `README.md`.** ≤ 600 lines, English only. Sections:
      overview, features, install (`npx @diecoscai/hevy-mcp`), getting a
      Hevy Pro API key, 4 per-client config blocks (Claude Desktop, Claude
      Code CLI, Cursor, VS Code MCP), env vars (`HEVY_API_KEY`,
      `HEVY_MCP_ALLOW_WRITES`), complete 22-tool reference, dry-run note,
      dev setup, registry link, license.
- [ ] **B5 — Overflow docs.** `docs/tools.md` (full tool reference with
      schemas + examples), `docs/configuration.md` (client wiring details),
      `docs/examples.md` (common prompts/flows), `docs/security.md`
      (dry-run, no-DELETE, PRO-only key, CORS, rate limits).
- [ ] **B6 — `CHANGELOG.md`** following Keep-a-Changelog; seed entry for
      `0.1.0` with added/changed/fixed bullets covering the Phase A work.
- [ ] **B7 — `CONTRIBUTING.md`** with dev setup, how to run MCP Inspector,
      how to add a tool (validate.ts schema → handler → description →
      test).
- [ ] **B8 — `.github/workflows/ci.yml`.** Matrix Node 20 + 22. Steps:
      checkout, setup-node, `npm ci`, `npm run build`, `npm run lint`,
      `npm test`. Trigger: push + PR to `main`.
- [ ] **B9 — `.github/workflows/release.yml`.** Trigger on tag `v*.*.*`.
      Steps: checkout, setup-node with `registry-url:
      'https://registry.npmjs.org'`, `npm ci`, `npm run build`,
      `npm publish --access public` using `${{ secrets.NPM_TOKEN }}`.
- [ ] **B10 — Inspector script.** `package.json` →
      `"inspect": "npx @modelcontextprotocol/inspector node dist/index.js"`.
- [ ] **B11 — `server.json`** at repo root. Schema
      `https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json`,
      `name: "io.github.diecoscai/hevy-mcp"`, version tracks `package.json`,
      description, single stdio package entry pointing at
      `@diecoscai/hevy-mcp` on npm.
- [ ] **B12 — `npm pack --dry-run` audit.** Confirm the tarball lists only
      `dist/**`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`.
      No `tests/`, no `src/`, no `.github/`.
- [ ] **B13 — Update `~/.claude/commands/hevy.md`** to reflect the 22 tools
      and link to the public `@diecoscai/hevy-mcp` package.
- [ ] **B14 — User-gated: npm alpha publish.** User runs
      `npm publish --access public` with `version: "0.1.0-alpha.1"` and
      verifies `npx @diecoscai/hevy-mcp@0.1.0-alpha.1` works on a clean
      machine. Requires `NPM_TOKEN`.
- [ ] **B15 — User-gated: MCP registry publish.** User installs
      `mcp-publisher`, runs `mcp-publisher login github`, then
      `mcp-publisher publish`. Verify via
      `curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.diecoscai/hevy-mcp"`.

---

## Verifier gates

### Phase A gate
- `npm ci && npm run build && npm test && npm run lint` all exit 0.
- Subprocess probe: `node dist/index.js` answers `tools/list` with exactly
  22 tools; every `inputSchema` is valid JSON Schema Draft 2020-12 under
  `ajv`.
- Negative probe: `hevy_create_exercise_template` with a 300-char title
  returns `{ isError: true, ... "title must be ≤ 255 chars; got 300" }`;
  zero network traffic.
- Dry-run probe: `hevy_create_routine_folder` without
  `HEVY_MCP_ALLOW_WRITES=1` returns `{ dry_run: true, would_send: {...},
  hint: "..." }`; zero network traffic.
- Integration tests: real reads against `api.hevyapp.com` pass when
  `HEVY_API_KEY` is set; writes mocked via `nock`.
- Language gate: zero non-English hits across user-facing files.

### Phase B gate
- `npm pack --dry-run` lists only `dist/**`, `README.md`, `LICENSE`,
  `CHANGELOG.md`, `package.json`.
- `npm run inspect` opens the Inspector and lists 22 tools;
  `hevy_get_user_info` returns the real user.
- `npx @diecoscai/hevy-mcp` (after B14) prints usage + required env vars +
  README link, English only.
- GitHub Actions green on Node 20 and 22.
- `server.json` validates against the MCP registry schema.
- Registry search returns the published listing after B15.

## Open questions for the user (before Phase B publish steps)
- npm name confirmed? Default `@diecoscai/hevy-mcp` (scoped); plain
  `hevy-mcp` is taken by chrisdoc.
- `NPM_TOKEN` minted with publish scope for `@diecoscai/*`?
- GitHub OAuth ready for `mcp-publisher login github` (namespace
  `io.github.diecoscai/*`)?

## Notes
- Source specs: `/home/dieco/dev/hobby/hevy-scrap/docs/**` (never modified).
- Internal research doc convention: `docs/features/<feature>.md`.
- Known server quirks to NOT replicate: no DELETE on any `/v1/*` resource,
  no length caps on titles/descriptions, no type coercion, no rate limits,
  body-before-auth on `POST /v1/body_measurements`. Client-side validation
  (A5) is what prevents a repeat of the 5-record account pollution.
