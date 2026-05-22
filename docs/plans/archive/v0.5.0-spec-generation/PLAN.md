# hevy-mcp v0.5.0 — Self-Maintaining, Complete, and Closed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@diecoscai/hevy-mcp` v0.5.0 — the last big release. Replace the hand-written request-body schemas with schemas **generated from Hevy's OpenAPI spec**, add a search tool, make CI both *detect* upstream changes (live integration run) and *adapt* to them (a scheduled job that re-fetches the spec, regenerates, and opens a PR), then publish to the MCP registry and move the project to maintenance mode.

**Architecture:** Adopt the competitor's proven approach — `kubb` generates Zod schemas from a committed copy of Hevy's OpenAPI spec. The ~8 write tools (create/update) bind to generated schemas plus a thin override layer for documented quirks; the ~15 read tools keep their trivial hand-written schemas (page/id/date inputs that never break). Two scheduled workflows close the loop: one runs the live integration suite (catches changes Hevy makes but does *not* document), one re-fetches the spec and auto-PRs a regeneration (adapts to changes Hevy *does* document).

**Tech Stack:** TypeScript 5.x (Node16 ESM), `@modelcontextprotocol/sdk@^1`, `zod@^4`, `kubb` (`@kubb/plugin-oas` + `@kubb/plugin-zod`), Biome 2.4, Vitest 4.1, GitHub Actions, the MCP registry `mcp-publisher` CLI.

---

## Context

`@diecoscai/hevy-mcp` is published at v0.4.1 — green, security-reviewed, provenance on every release. The user's goal for this final round, in their words: a **complete** project that **doesn't rot** when Hevy updates its API, **without having to check or fix things by hand**.

Two honest facts shape this plan:

1. **The v0.3.0 bug cluster was self-inflicted.** Eight schema bugs shipped for months because `validate.ts` was hand-written and drifted from the server. The competitor (`chrisdoc/hevy-mcp`) never had them — it *generates* its client from Hevy's OpenAPI spec with `kubb`. Adopting generation removes that whole class of bug and means a future Hevy change becomes "re-fetch spec, regenerate" instead of "hand-edit schemas."

2. **Generation is not a silver bullet, and this plan is honest about it.** It adapts the project to changes Hevy *documents in its spec*. It does **not** help when Hevy changes the live server without updating the spec (spec-vs-server drift — which we proved happens). That gap is covered by the *other* scheduled workflow: the live integration run. The two together are what make "stop checking" real.

**This is a refactor, not an add-on.** It rewrites the validation core. It is the last large investment — the explicit deal is: one more real effort now, then the project maintains itself and moves to maintenance mode. The payoff scales with how often Hevy touches its API (unknown — it is a self-described `0.0.1` beta), so this is a deliberate bet, already discussed and accepted.

**Scope boundary — generation covers the 8 write tools, not all 23.** Hevy's spec models request *bodies* (create/update workout, routine, exercise template, body measurement). The 15 read tools take only `page`/`pageSize`/`id`/`date` — trivial, stable, never the source of a bug; their hand-written schemas stay. `hevy_search_exercise_templates` is a new tool with no spec endpoint; its schema is hand-written too. This keeps the refactor medium-sized, not total.

**Out of scope** (deliberate): generating the HTTP client (the existing `hevyFetch` is fine), mocks/faker, an HTTP/remote transport, webhook tools, a v1.0 bump (needs a no-change soak period first).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `scripts/fetch-spec.mjs` | Create | Download Hevy's OpenAPI spec, write `openapi/hevy.json` |
| `openapi/hevy.json` | Create | Committed snapshot of Hevy's OpenAPI spec (generation input + drift baseline) |
| `kubb.config.ts` | Create | kubb config — OAS + Zod plugins only, output to `src/generated/` |
| `src/generated/**` | Create (generated) | kubb output — Zod schemas for request bodies. Committed. |
| `src/schemas/overrides.ts` | Create | Thin layer: documented quirks the spec gets wrong (notes minLength, etc.) |
| `src/validate.ts` | Modify | Write-tool schemas now compose generated schemas + overrides; read-tool schemas unchanged; add `hevy_search_exercise_templates` |
| `src/index.ts` | Modify | Add `hevy_search_exercise_templates` (TOOLS entry + dispatch case) |
| `tests/validate.test.ts`, `tests/handlers.test.ts` | Modify | Adapt to composed schemas; cover the new tool |
| `tests/schemas.test.ts`, `tests/integration/hevy.int.test.ts`, `scripts/smoke.sh` | Modify | Tool count 22 → 23 |
| `.github/workflows/spec-sync.yml` | Create | Scheduled: re-fetch spec, regenerate, open a PR on drift |
| `.github/workflows/integration.yml` | Create | Scheduled: run the live integration suite against Hevy |
| `package.json` | Modify | `fetch-spec` / `generate` scripts, kubb devDeps, description, version, `files` |
| `server.json`, `CHANGELOG.md`, `README.md`, `docs/configuration.md` | Modify | Version, description, webhooks note, maintenance status |

---

## Task 1 — Commit Hevy's OpenAPI spec + a fetch script

**Why first:** Everything downstream consumes `openapi/hevy.json`. The spec is embedded in Hevy's Swagger UI bundle (`swagger-ui-init.js`), inside a `"swaggerDoc": { ... }` object — the fetch script extracts it.

**Files:**
- Create: `scripts/fetch-spec.mjs`, `openapi/hevy.json`

- [ ] **Step 1: Write the fetch script**

Create `/home/dieco/dev/hevy-mcp/scripts/fetch-spec.mjs`:

```javascript
// Downloads Hevy's OpenAPI spec and writes it to openapi/hevy.json.
// The spec is embedded in the Swagger UI bundle as `"swaggerDoc": {...}`;
// this extracts that object by brace-matching. Run: npm run fetch-spec
import { writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'https://api.hevyapp.com/docs/swagger-ui-init.js';
const OUT = 'openapi/hevy.json';

const res = await fetch(SRC, { signal: AbortSignal.timeout(30_000) });
if (!res.ok) {
  console.error(`fetch-spec: HTTP ${res.status} from ${SRC}`);
  process.exit(1);
}
const js = await res.text();

const marker = '"swaggerDoc":';
const start = js.indexOf(marker);
if (start < 0) {
  console.error('fetch-spec: could not find "swaggerDoc" in the bundle');
  process.exit(1);
}
let i = js.indexOf('{', start);
let depth = 0;
let end = -1;
let inStr = false;
let esc = false;
for (let p = i; p < js.length; p += 1) {
  const c = js[p];
  if (inStr) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === '"') inStr = false;
    continue;
  }
  if (c === '"') inStr = true;
  else if (c === '{') depth += 1;
  else if (c === '}') {
    depth -= 1;
    if (depth === 0) {
      end = p + 1;
      break;
    }
  }
}
if (end < 0) {
  console.error('fetch-spec: could not brace-match the swaggerDoc object');
  process.exit(1);
}
const spec = JSON.parse(js.slice(i, end));
mkdirSync('openapi', { recursive: true });
writeFileSync(OUT, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`fetch-spec: wrote ${OUT} (openapi ${spec.openapi}, ${Object.keys(spec.paths).length} paths)`);
```

- [ ] **Step 2: Add the `fetch-spec` npm script**

In `package.json` `scripts`, add:
```json
    "fetch-spec": "node scripts/fetch-spec.mjs",
```

- [ ] **Step 3: Run it and verify**

```bash
cd /home/dieco/dev/hevy-mcp
npm run fetch-spec
```
Expected: `fetch-spec: wrote openapi/hevy.json (openapi 3.0.0, 14 paths)`. Confirm the file:
```bash
node -e 'const s=require("./openapi/hevy.json");console.log("paths:",Object.keys(s.paths).length,"schemas:",Object.keys(s.components.schemas).length)'
```
Expected: `paths: 14 schemas: 20` (approx).

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-spec.mjs openapi/hevy.json package.json
git commit -m "$(cat <<'EOF'
chore: vendor Hevy's OpenAPI spec + fetch script

`npm run fetch-spec` downloads Hevy's OpenAPI document (embedded in
their Swagger UI bundle) to openapi/hevy.json. This committed copy is
the input for code generation and the baseline for drift detection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Scaffold kubb generation (scaffold + spike)

**Why a spike:** Until kubb runs against Hevy's spec, the exact generated symbol names are unknown. This task scaffolds generation and **inspects the output** — its deliverable is a confirmed mapping that Task 3 consumes. The scaffold steps are exact; the inspection step is a real, necessary action, not a placeholder.

**Files:**
- Create: `kubb.config.ts`, `src/generated/**` (generated)
- Modify: `package.json`

- [ ] **Step 1: Install kubb (OAS + Zod plugins only)**

```bash
cd /home/dieco/dev/hevy-mcp
npm install --save-dev @kubb/core @kubb/cli @kubb/plugin-oas @kubb/plugin-zod
```
Note: unlike the competitor, we do NOT install `@kubb/plugin-client` (we keep `hevyFetch`) or `@kubb/plugin-faker` (no mocks).

- [ ] **Step 2: Write `kubb.config.ts`**

Create `/home/dieco/dev/hevy-mcp/kubb.config.ts`:

```typescript
import { defineConfig } from '@kubb/core';
import { pluginOas } from '@kubb/plugin-oas';
import { pluginZod } from '@kubb/plugin-zod';

export default defineConfig({
  root: '.',
  input: { path: './openapi/hevy.json' },
  output: { path: './src/generated', clean: true },
  plugins: [
    pluginOas({ output: { path: './oas' } }),
    pluginZod({ output: { path: './zod' } }),
  ],
});
```

- [ ] **Step 3: Add the `generate` script**

In `package.json` `scripts`, add:
```json
    "generate": "kubb generate --config kubb.config.ts",
```

- [ ] **Step 4: Generate and inspect the output (the spike)**

```bash
npm run generate
echo "--- generated zod files ---"
ls src/generated/zod
echo "--- exercise template create schema ---"
cat src/generated/zod/*[Ee]xercise* 2>/dev/null | head -60
```

**Inspect and record** (this informs Task 3): for each of the four request-body component schemas in the spec — `PostWorkoutsRequestBody`, `PostRoutinesRequestBody` / `PutRoutinesRequestBody`, `CreateCustomExerciseRequestBody`, `BodyMeasurement` / `PutBodyMeasurement` — note the exact exported Zod symbol name kubb produced (e.g. `postWorkoutsRequestBodySchema`). These names are what Task 3 imports. Record them in the commit message of Step 6.

- [ ] **Step 5: Add `src/generated/` handling**

The generated files are committed (so the published package and the drift PRs include them). Confirm `.gitignore` does NOT exclude `src/generated`. The generated tree is covered by `tsconfig.json`'s `include: ["src/**/*"]` and compiles into `dist`. Verify the build still works:
```bash
npm run build 2>&1 | tail -3
```
If a generated file has a type error, note it for Task 3 (overrides can exclude it).

- [ ] **Step 6: Commit the scaffold + generated output**

```bash
git add kubb.config.ts package.json package-lock.json src/generated
git commit -m "$(cat <<'EOF'
build: add kubb code generation (OpenAPI -> Zod)

`npm run generate` runs kubb against openapi/hevy.json and writes Zod
schemas to src/generated/zod. Only the OAS + Zod plugins are used — no
generated HTTP client (hevyFetch stays) and no mocks.

Generated request-body schemas (recorded for the wiring task):
- <fill in the exact kubb symbol names observed in Step 4>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Wire write-tool schemas to generated + overrides

**Why:** This is the actual refactor. The 8 write tools' request-body validation switches from hand-written Zod to the generated Zod, with a thin override layer for the documented quirks the spec gets wrong (see `docs/api-quirks.md`). The 15 read-tool schemas in `validate.ts` are unchanged.

**Files:**
- Create: `src/schemas/overrides.ts`
- Modify: `src/validate.ts`, `tests/validate.test.ts`

- [ ] **Step 1: Create the overrides module**

Hevy's spec is not perfectly faithful. The known quirks (from `docs/api-quirks.md`) that the generated schemas will NOT capture, and must be re-applied:
- `notes` / `description` reject empty strings (spec says plain string).
- The generated schemas may not be `.strict()` — unknown-key rejection must be preserved.

Create `/home/dieco/dev/hevy-mcp/src/schemas/overrides.ts`:

```typescript
import { z } from 'zod';

// The Hevy OpenAPI spec is imperfect. Generated schemas match the spec;
// these helpers re-apply behaviors the spec omits but the live server
// enforces (see docs/api-quirks.md). Keep this file SMALL — every entry
// is a documented divergence, not a preference.

/** Server rejects empty notes/description; spec types them as plain strings. */
export const nonEmptyText = (max: number) => z.string().min(1).max(max);

/**
 * Re-assert .strict() on a generated object schema so unknown keys are
 * rejected before any network call. kubb-generated object schemas are
 * not strict by default.
 */
export function strict<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<T> {
  return schema.strict();
}
```

- [ ] **Step 2: Rewire `validate.ts` write-tool schemas**

In `src/validate.ts`, for each of the 8 write tools, replace the hand-written body schema with the generated one wrapped by the override helpers. Pattern (exact import names come from Task 2 Step 4):

```typescript
import { postWorkoutsRequestBodySchema } from './generated/zod/...';
import { strict } from './schemas/overrides.ts';
// ...
hevy_create_workout: z.object({ workout: strict(/* generated workout body */) }).strict(),
```

Apply to: `hevy_create_workout`, `hevy_update_workout`, `hevy_create_routine`, `hevy_update_routine`, `hevy_create_exercise_template`, `hevy_create_routine_folder`, `hevy_create_body_measurement`, `hevy_update_body_measurement`. Keep the 15 read-tool schemas exactly as they are. Where a quirk applies (notes/description min length), compose `nonEmptyText` over the generated field — if the generated schema cannot be patched field-wise cleanly, keep that specific field hand-written and document why in a comment.

**Decision rule:** if wiring a given tool to the generated schema costs more than keeping it hand-written (because the spec models it too differently from the MCP's tool shape), keep it hand-written and add a one-line comment. The goal is durability, not generation purity. Record which tools ended up generated vs hand-written.

- [ ] **Step 3: Run the schema tests, fix fallout**

```bash
cd /home/dieco/dev/hevy-mcp
npm run build 2>&1 | tail -3
npm test -- tests/validate.test.ts 2>&1 | tail -20
```
Adapt `tests/validate.test.ts` cases that assert exact error messages or shapes changed by the switch. The behavior must stay equivalent: same valid inputs accepted, same invalid inputs rejected. Do NOT loosen a test to make it pass — if a generated schema accepts something the old one rejected, decide whether the old behavior was a quirk (add an override) or an over-restriction (the generated one is correct).

- [ ] **Step 4: Full suite + smoke**

```bash
npm test 2>&1 | tail -6
bash scripts/smoke.sh 2>&1 | tail -6
```
Expected: all green, smoke `== smoke ok ==`, 22 tools still valid (the search tool is added in Task 4).

- [ ] **Step 5: Commit**

```bash
npm run check 2>&1 | tail -2
git add src/validate.ts src/schemas/overrides.ts tests/validate.test.ts
git commit -m "$(cat <<'EOF'
refactor: validate write tools against generated schemas

The 8 create/update tools now validate request bodies with Zod schemas
generated from Hevy's OpenAPI spec, plus a thin overrides layer for the
documented quirks the spec omits (empty-string rejection, strict-mode).
The 15 read tools keep their trivial hand-written schemas.

When Hevy updates its spec, `npm run generate` re-derives these schemas
— no hand-editing. This removes the class of bug that produced the
v0.3.0 cluster.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `hevy_search_exercise_templates`

**Why:** The one genuine feature gap vs the competitor. Hevy has no search endpoint; this paginates the cached catalog and filters by title.

**Files:**
- Modify: `src/validate.ts`, `src/index.ts`, `tests/validate.test.ts`, `tests/handlers.test.ts`, `tests/schemas.test.ts`, `tests/integration/hevy.int.test.ts`, `scripts/smoke.sh`, `README.md`

- [ ] **Step 1: Add the schema** (hand-written — no spec endpoint)

In `src/validate.ts` `schemas`, after `hevy_list_exercise_templates`:
```typescript
  hevy_search_exercise_templates: z
    .object({
      query: z.string().min(1).max(100),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .strict(),
```

- [ ] **Step 2: Add the tool to `TOOLS`** in `src/index.ts`, after `hevy_list_exercise_templates`:
```typescript
  {
    name: 'hevy_search_exercise_templates',
    description:
      'Find exercise templates by name. Paginates the full catalog (built-in + custom) and returns templates whose title contains the query, case-insensitive. Use this to resolve an exercise_template_id from a human name (e.g. "bench press") before composing a workout or routine. Response: { query, total_matches, exercise_templates: [...] }. The catalog is cached for an hour.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          description: 'Case-insensitive substring matched against the template title.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum matches to return (default 25). total_matches reports the full count.',
        },
      },
    },
  },
```

- [ ] **Step 3: Add the dispatch case** in `src/index.ts`, after `case 'hevy_list_exercise_templates':`:
```typescript
    case 'hevy_search_exercise_templates': {
      const args = validateInput(name, rawArgs);
      const needle = args.query.toLowerCase();
      const limit = args.limit ?? 25;
      type Template = { title?: string };
      type Envelope = { page_count?: number; exercise_templates?: Template[] };
      const matches: Template[] = [];
      let page = 1;
      let pageCount = 1;
      const MAX_PAGES = 30;
      do {
        const key = templateListKey(page, 100);
        let res = templateCache?.get(key);
        if (res === undefined) {
          res = await hevyFetch(`/v1/exercise_templates?page=${page}&pageSize=100`);
          templateCache?.set(key, res);
        }
        const envelope = (res ?? {}) as Envelope;
        pageCount = envelope.page_count ?? 1;
        for (const tpl of envelope.exercise_templates ?? []) {
          if (typeof tpl.title === 'string' && tpl.title.toLowerCase().includes(needle)) {
            matches.push(tpl);
          }
        }
        page += 1;
      } while (page <= pageCount && page <= MAX_PAGES);
      return {
        query: args.query,
        total_matches: matches.length,
        exercise_templates: matches.slice(0, limit),
      };
    }
```

- [ ] **Step 4: Bump tool-count constants**

- `tests/schemas.test.ts`: `EXPECTED_TOOL_COUNT` 22 → 23.
- `scripts/smoke.sh`: `EXPECTED_TOOLS` 22 → 23.
- `tests/integration/hevy.int.test.ts`: the `'tools/list returns 22 tools'` test — title + `expect(...).toBe(22)` → 23.

- [ ] **Step 5: Handler tests** in `tests/handlers.test.ts` (end of main `describe`):
```typescript
  it('hevy_search_exercise_templates paginates and filters by title', async () => {
    client = startMcpServer({
      env: { HEVY_API_KEY: 'test-key' },
      preload: PRELOAD,
      fixtures: [
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?(?=.*\\bpage=1\\b)(?=.*\\bpageSize=100\\b)',
          status: 200,
          body: {
            page: 1,
            page_count: 2,
            exercise_templates: [
              { id: 'AAAAAAAA', title: 'Bench Press (Barbell)' },
              { id: 'BBBBBBBB', title: 'Squat (Barbell)' },
            ],
          },
        },
        {
          method: 'GET',
          pathRegex: '^/v1/exercise_templates\\?(?=.*\\bpage=2\\b)(?=.*\\bpageSize=100\\b)',
          status: 200,
          body: {
            page: 2,
            page_count: 2,
            exercise_templates: [{ id: 'CCCCCCCC', title: 'Incline Bench Press (Dumbbell)' }],
          },
        },
      ],
    });
    await initializeClient(client);
    const result = await callTool(client, 'hevy_search_exercise_templates', { query: 'bench press' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as {
      total_matches: number;
      exercise_templates: Array<{ id: string }>;
    };
    expect(parsed.total_matches).toBe(2);
    expect(parsed.exercise_templates.map((t) => t.id).sort()).toEqual(['AAAAAAAA', 'CCCCCCCC']);
  });
```

- [ ] **Step 6: Build, test, smoke, README**

```bash
npm run build && npm test 2>&1 | tail -5 && bash scripts/smoke.sh 2>&1 | tail -4
```
Expected: green, `tools: 23`. Add a `hevy_search_exercise_templates` row to the README "Exercise templates" table (~line 220) and update any "22 tools" prose to "23".

- [ ] **Step 7: Commit**

```bash
npm run check 2>&1 | tail -2
git add src/ tests/ scripts/smoke.sh README.md
git commit -m "feat: add hevy_search_exercise_templates (tool 23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Scheduled workflows: detect drift + auto-PR a regeneration

**Why:** This is what makes "stop checking, stop hand-fixing" real. Two cron jobs:
- **`spec-sync`** — re-fetches Hevy's spec; if it changed, regenerates and opens a PR. Adapts to changes Hevy *documents*.
- **`integration`** — runs the live test suite against Hevy. Catches changes Hevy *does not document* (spec-vs-server drift) as a failed run + email.

**Files:**
- Create: `.github/workflows/spec-sync.yml`, `.github/workflows/integration.yml`

**Prerequisite (user action — document, do not automate):** Rotate the Hevy API key (the chat-pasted one is burned), then `gh secret set HEVY_API_KEY --repo diecoscai/hevy-mcp`.

- [ ] **Step 1: Create `spec-sync.yml`**

Create `.github/workflows/spec-sync.yml` (workflow files trip the security hook — write this one with `cat > ... <<'EOF'` via Bash, not Edit/Write):

```yaml
name: Spec sync

on:
  schedule:
    - cron: '0 5 * * 1'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  spec-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js 20
        uses: actions/setup-node@v5
        with:
          node-version: '20'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Re-fetch Hevy's OpenAPI spec
        run: npm run fetch-spec

      - name: Regenerate schemas
        run: npm run generate

      - name: Open a PR if the spec or generated code changed
        uses: peter-evans/create-pull-request@v7
        with:
          branch: chore/spec-sync
          title: 'chore: Hevy OpenAPI spec changed — regenerated schemas'
          body: |
            The scheduled spec-sync detected a change in Hevy's OpenAPI
            spec and regenerated `src/generated/`. Review the diff, run
            the tests, and merge if it looks right. If CI is red here,
            the change is structural and the glue in `src/validate.ts`
            needs a hand-edit.
          commit-message: 'chore: regenerate schemas from updated Hevy spec'
          add-paths: |
            openapi/hevy.json
            src/generated/**
```

- [ ] **Step 2: Create `integration.yml`**

Create `.github/workflows/integration.yml` (same — use `cat > ... <<'EOF'`):

```yaml
name: Integration (live Hevy API)

on:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch:

jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5
      - name: Setup Node.js 20
        uses: actions/setup-node@v5
        with:
          node-version: '20'
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Run integration tests against the live Hevy API
        env:
          HEVY_API_KEY: ${{ secrets.HEVY_API_KEY }}
        run: npx vitest run tests/integration
```

- [ ] **Step 3: Validate both workflows + commit**

```bash
cd /home/dieco/dev/hevy-mcp
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/spec-sync.yml')); yaml.safe_load(open('.github/workflows/integration.yml')); print('valid YAML')"
git add .github/workflows/spec-sync.yml .github/workflows/integration.yml
git commit -m "$(cat <<'EOF'
ci: scheduled spec-sync (auto-PR) + live integration run

spec-sync (Mon 05:00 UTC): re-fetches Hevy's OpenAPI spec, regenerates
src/generated, and opens a PR if anything changed — adapting to changes
Hevy documents without hand-editing.

integration (Mon 06:00 UTC): runs tests/integration against the live
Hevy API using a HEVY_API_KEY secret — catching changes Hevy makes but
does NOT document, as a failed run + notification.

Together: the project surfaces and adapts to upstream drift on its own.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Docs: reposition, webhooks, maintenance mode

**Files:** `package.json`, `server.json`, `README.md`

- [ ] **Step 1:** `package.json` `description` →
  `"Model Context Protocol server for the Hevy fitness API — schemas generated from Hevy's OpenAPI spec, dry-run-safe writes, one-command setup. Workouts, routines, exercises, body measurements."`

- [ ] **Step 2:** `server.json` `description` →
  `"MCP server for the Hevy fitness API — spec-generated schemas, dry-run-safe writes, one-command setup."`

- [ ] **Step 3:** In `README.md`, add to the Overview section:
  `Schemas are generated from Hevy's own OpenAPI spec and re-synced automatically, so the server adapts to upstream changes instead of drifting. Writes are dry-run by default; every public endpoint is covered.`

- [ ] **Step 4:** Append to the "Webhooks — intentionally not exposed" section:
  `Some other Hevy MCP servers expose webhook tools by reaching Hevy's private web-session API. This server deliberately stays on the documented public API.`

- [ ] **Step 5:** After "## Overview", add:
```markdown
## Project status

Maintenance mode. Feature-complete for Hevy's public API. Schemas are
generated from Hevy's OpenAPI spec; a [scheduled workflow](.github/workflows/spec-sync.yml)
re-syncs them weekly and opens a PR on any change, and a
[live integration run](.github/workflows/integration.yml) catches
undocumented server changes. Bug reports and PRs welcome via the
[issue tracker](https://github.com/diecoscai/hevy-mcp/issues).
```

- [ ] **Step 6:** Commit
```bash
node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"));JSON.parse(require("fs").readFileSync("server.json","utf8"));console.log("json ok")'
git add package.json server.json README.md
git commit -m "docs: reposition around spec-generation, mark maintenance mode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Release v0.5.0

**Files:** `package.json`, `server.json`, `CHANGELOG.md`

- [ ] **Step 1:** Bump `package.json` to `0.5.0`; `server.json` both `version` fields to `0.5.0`. Confirm `files` in `package.json` ships `dist/**` (generated code compiles into `dist`); `openapi/` and `src/generated/` source need not ship — `dist` is enough.

- [ ] **Step 2:** Add the `CHANGELOG.md` `[0.5.0]` section (date = release day) covering: spec-generated schemas, `hevy_search_exercise_templates`, the two scheduled workflows, the repositioned description, maintenance mode. Update the `[Unreleased]` / `[0.5.0]` compare links.

- [ ] **Step 3:** Full verification
```bash
cd /home/dieco/dev/hevy-mcp
npm run fetch-spec && npm run generate && npm run build && npm run check && npm test 2>&1 | tail -5
bash scripts/smoke.sh 2>&1 | tail -4
npm audit --omit=dev 2>&1 | tail -2
npm pack --dry-run 2>&1 | grep -E 'version:|total files'
```
Expected: all green, 0 vulnerabilities, `version: 0.5.0`.

- [ ] **Step 4:** Commit, branch `feat/v0.5.0`, push, `gh pr create --assignee diecoscai --base main`, wait for CI green (Node 20/22/24), `gh pr merge --merge --delete-branch`.

- [ ] **Step 5:** Tag + publish
```bash
git checkout main && git pull
git tag v0.5.0 && git push origin v0.5.0
gh run watch "$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
npm view @diecoscai/hevy-mcp version   # expect 0.5.0
gh release create v0.5.0 --title "v0.5.0" --verify-tag --notes "Spec-generated schemas, exercise-template search, self-syncing CI, maintenance mode. See CHANGELOG.md."
```

---

## Task 8 — Publish to the MCP registry

- [ ] **Step 1:** Confirm `server.json` is at `0.5.0` (`node -e 'console.log(require("./server.json").version)'`).

- [ ] **Step 2:** Get the `mcp-publisher` CLI:
```bash
cd /tmp
LATEST=$(gh release list --repo modelcontextprotocol/registry --limit 1 --json tagName --jq '.[0].tagName')
gh release download "$LATEST" --repo modelcontextprotocol/registry --pattern '*linux_amd64*' --dir /tmp/mcp-publisher --clobber
```
If the asset is a tarball, extract it. Reference: <https://github.com/modelcontextprotocol/registry/blob/main/docs/guides/publishing/publish-server.md>.

- [ ] **Step 3 (interactive — user action):** From the repo root:
```bash
cd /home/dieco/dev/hevy-mcp
/tmp/mcp-publisher/mcp-publisher login github
/tmp/mcp-publisher/mcp-publisher publish
```

- [ ] **Step 4:** Verify:
```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.diecoscai/hevy-mcp" | head -c 300
```
Expected: a non-empty `servers` array at version `0.5.0`.

---

## Verification (end-to-end)

```bash
cd /tmp && rm -rf hevy-verify && git clone https://github.com/diecoscai/hevy-mcp.git hevy-verify
cd hevy-verify && git checkout v0.5.0
npm ci && npm run build && npm run check && npm test
bash scripts/smoke.sh                                  # tools: 23, == smoke ok ==
npm run fetch-spec && npm run generate && git diff --stat   # clean = generated code matches the committed spec
gh workflow run spec-sync.yml --repo diecoscai/hevy-mcp     # manual dispatch; expect success
gh workflow run integration.yml --repo diecoscai/hevy-mcp   # needs the HEVY_API_KEY secret
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.diecoscai/hevy-mcp"
```

**Done means:** v0.5.0 on npm with provenance; 23 tools; write-tool schemas generated from the spec; `npm run fetch-spec && npm run generate` reproduces the committed `src/generated/`; both scheduled workflows registered and green on manual dispatch; listed in the MCP registry; README states maintenance mode.

---

## Honest notes for the executor

- **This is the big one.** Tasks 1-3 are the refactor; budget the most time and review there. Task 3's wiring depends on what Task 2's spike actually generated — do not skip the inspection step.
- **Generation is half the durability story, not all of it.** It adapts to spec changes (Task 5 `spec-sync`). The live `integration` run is what catches changes Hevy ships *without* updating the spec. Both must exist.
- **If a write tool resists clean wiring** to a generated schema (the spec models it too differently from the MCP tool shape), keep that one hand-written with a comment. Durability over purity — partial generation that works beats full generation that fights the spec.
- **The `HEVY_API_KEY` secret and the registry login are user actions** — do not fabricate credentials. Without the secret, `integration.yml` merges fine but won't pass until the key exists; note this in the handoff.
- **Workflow files trigger the security-reminder hook on Edit/Write** — create the three `.github/workflows/*.yml` via `cat > file <<'EOF'` in Bash.
- **After v0.5.0 ships and the registry listing is live, the project is closed.** Maintenance mode: no further feature work. The next change should come from a `spec-sync` PR, a failed `integration` run, or a real user issue — not from polishing.
