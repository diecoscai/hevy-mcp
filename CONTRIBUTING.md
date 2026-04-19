# Contributing

Thanks for considering a contribution to `@diecoscai/hevy-mcp`. This guide covers local setup, the "add a tool" loop, and the checks that run on every PR.

## Development setup

Requires Node.js >= 20.

```bash
git clone https://github.com/diecoscai/hevy-mcp.git
cd hevy-mcp
npm ci
npm run build
```

Run the server against the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) for interactive debugging:

```bash
npm run inspect
```

The inspector launches a UI that speaks MCP over stdio — you can list tools, send sample inputs, and inspect raw responses.

## Running tests

```bash
npm test              # one-shot run
npm run test:watch    # re-run on file change
npm run coverage      # V8 coverage report under coverage/
```

Tests live under `tests/` and are grouped by concern: unit tests for validators and dispatch logic, schema tests that fuzz every tool against its Zod schema, and HTTP tests that use [`nock`](https://github.com/nock/nock) to mock `api.hevyapp.com`.

## Adding a new tool

The dispatch flow is linear; each new tool touches the same four places.

1. **Schema (`src/validate.ts`).** Add a Zod schema using `.strict()` on every object. Reuse the shared primitives (UUID, calendar-date, enum unions) where possible. Export the inferred TypeScript type.
2. **Tool name (`src/index.ts`).** Add the tool identifier to `TOOL_NAMES` (the single source of truth the tests iterate over).
3. **Tool spec (`src/index.ts`).** Append a `Tool` object to the `TOOLS` array with `name`, `description`, and `inputSchema` (JSON Schema, not Zod — use `zodToJsonSchema` or hand-write it if the Zod output is noisy).
4. **Dispatch case (`src/index.ts`).** Add a `case TOOL_NAMES.<new>:` branch. Always call `validateInput(name, rawArgs)` first; wrap `POST` / `PUT` calls with `guardWrite` so they respect `HEVY_MCP_ALLOW_WRITES`.

Then:

5. **Tests (`tests/`).** Add a unit test for the handler and extend the schema suite so every named tool gets a valid-input and an unknown-field probe.
6. **README.** Update the tool table in the appropriate section of `README.md` and the detailed entry in `docs/tools.md`.

## Code style

This repo uses [Biome](https://biomejs.dev/) for linting and formatting. No ESLint / Prettier.

```bash
npm run lint      # lint src + tests
npm run format    # write formatted output
npm run check     # combined lint + format check (CI-style)
```

Conventions enforced by Biome: 2-space indent, single quotes, trailing commas, sorted imports. Keep modules small; prefer pure functions over classes.

## Commit conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/). Typical prefixes used here:

- `feat(scope):` — user-visible feature (new tool, new CLI flag).
- `fix(scope):` — bug fix.
- `docs(scope):` — README / CHANGELOG / `docs/` edits.
- `test(scope):` — test-only changes.
- `chore(scope):` — dependency bumps, gitignore, metadata.
- `ci(scope):` — workflow changes.
- `refactor(scope):` — behaviour-preserving code moves.

Keep commits small and focused. Use the body for the "why", not the "what".

## Pull request checklist

Before opening a PR, confirm:

- [ ] `npm run build` succeeds with no TypeScript errors.
- [ ] `npm test` passes locally.
- [ ] `npm run lint` is clean (run `npm run format` first if Biome suggests fixes).
- [ ] New tools appear in the README tool table and in `docs/tools.md`.
- [ ] User-visible changes have a line in `CHANGELOG.md` under `## [Unreleased]`.
- [ ] No secrets, API keys, or personal UUIDs in the diff.
- [ ] No `console.log` / `debugger` left over from debugging.
- [ ] Writes are guarded by `guardWrite` — the dry-run contract is not optional.

CI runs the same build / lint / test gate on Node 20 and Node 22. Merging requires a green check.

## Reporting issues

Bugs, feature requests, and questions are welcome in the [issue tracker](https://github.com/diecoscai/hevy-mcp/issues). For security concerns, open a private advisory instead (see `docs/security.md`).
