# Security

Threat model and operational notes for running `@diecoscai/hevy-mcp` in real clients.

## What the server does

- Opens a stdio channel to the parent MCP client.
- Reads the Hevy API key from the `HEVY_API_KEY` environment variable (typically passed through your MCP client's `env` block).
- Makes HTTPS requests to `api.hevyapp.com/v1/*` endpoints documented in the public Hevy API.
- Returns the responses to the client verbatim (plus a SEP-1303 error envelope on failure).
- Writes nothing to disk — no config file, no cache, no logs.

## What the server never does

- No `DELETE` requests — the Hevy public API exposes no `DELETE` endpoint on any resource. The server has no code path that can emit a `DELETE`.
- No calls to private / undocumented endpoints.
- No telemetry, analytics, or third-party callbacks. The only outbound host is `api.hevyapp.com`.
- No writes without explicit opt-in (see "Dry-run default" below).

## Key handling

- The API key is treated as a secret. Nothing in the server ever logs it; error envelopes include the response status code and Hevy's response body but never the `api-key` header.
- The server does not create, read, or cache a credentials file. The only place the key exists on disk is your MCP client's own config (which you control).

### Rotation on leak

1. Revoke the key in the Hevy app: Settings → Developer → "Revoke".
2. Generate a new key in the same screen.
3. Replace the `HEVY_API_KEY` value in your MCP client's config file.
4. Restart the client so it re-spawns the server with the new env.

Key rotation is effectively instantaneous — Hevy's validation reads from a cache that clears on the next request.

### Per-client considerations

- **Claude Desktop / Cursor / VS Code** — the key lives in the client's JSON config file (`claude_desktop_config.json`, `~/.cursor/mcp.json`, `.vscode/mcp.json`). Treat those files as sensitive; avoid committing them to dotfile repos.
- **Claude Code CLI** — keys passed via `--env HEVY_API_KEY=...` appear in the shell history and in `ps aux` while the process is running. On shared machines, register the server via a stored client config instead of the CLI flag.
- **CI environments** — use environment secrets (`HEVY_API_KEY` as a GitHub Actions secret, for example). Never inline the key in a committed workflow.

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
