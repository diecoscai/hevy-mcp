# Security

Threat model and operational notes for running `@diecoscai/hevy-mcp` in real clients.

## What the server does

- Opens a stdio channel to the parent MCP client.
- Reads the Hevy API key from `HEVY_API_KEY` or `$XDG_CONFIG_HOME/hevy-mcp/config.json`.
- Makes HTTPS requests to `api.hevyapp.com/v1/*` endpoints documented in the public Hevy API.
- Returns the responses to the client verbatim (plus a SEP-1303 error envelope on failure).

## What the server never does

- No `DELETE` requests — the Hevy public API exposes no `DELETE` endpoint on any resource. The server has no code path that can emit a `DELETE`.
- No calls to private / undocumented endpoints.
- No telemetry, analytics, or third-party callbacks. The only outbound host is `api.hevyapp.com`.
- No writes without explicit opt-in (see "Dry-run default" below).

## Key handling

- The API key is treated as a secret. Nothing in the server ever logs it; error envelopes include a status code and Hevy's response body but never the api-key header.
- The stored-config path is `$XDG_CONFIG_HOME/hevy-mcp/config.json` with mode `0600` (directory `0700`). The setup flow creates both if missing.
- The env-var path (`HEVY_API_KEY`) is preferred when the key should only live in a client's config (e.g. Claude Desktop's `env` block) and never touch disk.

### Rotation on leak

1. Revoke the key in the Hevy app: Settings → Developer → "Revoke".
2. Generate a new key in the same screen.
3. Run `npx @diecoscai/hevy-mcp setup` and answer `y` to overwrite.
4. Restart the MCP client so it picks up the new file (or update the `env` block).

Key rotation is effectively instantaneous — Hevy's validation reads from a cache that clears on the next request.

### Per-client considerations

- **Claude Desktop / Cursor / VS Code** — the config file lives on the user's machine. Any process running as the same user can read it. Avoid committing `config.json` to dotfile repos; mode `0600` is not a substitute for "don't share this directory".
- **Claude Code CLI** — keys passed via `--env HEVY_API_KEY=...` appear in the shell history and in `ps aux` while the process is running. Prefer the stored-config flow on shared machines.
- **CI environments** — use environment secrets (`HEVY_API_KEY` as a GitHub Actions secret, for example). Do not commit a `config.json`.

## Dry-run default

All `POST` / `PUT` handlers check `HEVY_MCP_ALLOW_WRITES`:

- Unset or any value other than `1` — the server returns a `{ dry_run: true, would_send: {...} }` preview and makes no HTTP call.
- Set to `1` — the server performs the real request.

**Why default to off?** The Hevy API has no `DELETE`. A mistaken write persists on your account; the only way to "undo" is to `PUT` a corrected body. Making writes opt-in means a probing agent, a buggy prompt, or a runaway loop cannot silently pollute your history.

## Validation at the edge

Client-side Zod schemas catch:

- Oversized strings (`title > 255`, `description > 4096`, `notes > 2048`).
- Unknown keys on every object (`.strict()` across the schema).
- Out-of-range `pageSize` (anything outside `[1, 10]`, or `[1, 100]` for `hevy_list_exercise_templates`).
- Invalid enums: `SetType`, `RPE`, `MuscleGroup`, `EquipmentCategory`, `ExerciseType`.
- Malformed dates (`YYYY-MM-DD` with calendar validation — rejects `2099-99-99`).
- Non-UUID workout / routine / custom-template ids.

When validation fails, the tool returns `{ isError: true, content: [...] }` with `error_code: "VALIDATION_ERROR"` and no network traffic is issued.

## Rate limits

The Hevy public API does not publish rate limits. Empirically the endpoints tolerate burst traffic from a single account; this server adds no retry-with-backoff. If you run bulk-export flows, space requests by a few hundred milliseconds to stay polite.

## Reporting a vulnerability

Open a private security advisory on the [GitHub repository](https://github.com/diecoscai/hevy-mcp/security/advisories/new). Do not file a public issue.
