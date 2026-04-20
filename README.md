# @diecoscai/hevy-mcp

Model Context Protocol server for the [Hevy](https://www.hevyapp.com/) fitness API. Manage workouts, routines, exercises, and body measurements from any MCP-compatible client — Claude Desktop, Claude Code, Cursor, VS Code, and anything else that speaks MCP over stdio.

[![npm version](https://img.shields.io/npm/v/@diecoscai/hevy-mcp.svg)](https://www.npmjs.com/package/@diecoscai/hevy-mcp)
[![license](https://img.shields.io/npm/l/@diecoscai/hevy-mcp.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@diecoscai/hevy-mcp.svg)](./package.json)

## Overview

This MCP server exposes the public [Hevy API](https://api.hevyapp.com/docs) (`api.hevyapp.com/v1`) as 22 strongly-typed tools. LLM agents can list workouts, create routines, look up exercise templates, track body measurements, and follow a delta-sync feed — all without bespoke glue code on the client.

Design goals:

- **Safe by default.** Write operations return a `{ dry_run: true, would_send: { ... } }` preview unless `HEVY_MCP_ALLOW_WRITES=1` is set. The Hevy API has no `DELETE` on any resource, so accidental writes are permanent; dry-run is the brake.
- **Validated at the edge.** Every tool input is checked with [Zod](https://zod.dev/) before a single byte crosses the network. Oversized titles, unknown fields, out-of-range page sizes, and invalid enums fail fast with [SEP-1303](https://modelcontextprotocol.io/seps/1303-input-validation-errors-as-tool-execution-errors.md)-shaped errors the model can self-correct.
- **Zero extra setup.** Authentication is a single environment variable — `HEVY_API_KEY`. No wizards, no config files; just paste the snippet for your client.

## Prerequisites

- **Node.js 20 or later** (`node --version`).
- A **Hevy Pro subscription** — the public API is a Pro feature.
- A Hevy API key from <https://hevy.com/settings?developer>.

## Quick setup

1. Grab your API key at <https://hevy.com/settings?developer> (requires Hevy Pro).
2. Paste the snippet for your MCP client from [Configuration](#configuration) below, substituting your key into the `HEVY_API_KEY` entry.
3. Restart the client. The 22 Hevy tools appear in the tools panel.

> **Note on bare invocation.** Running `npx @diecoscai/hevy-mcp` with no arguments starts a stdio MCP server and blocks, waiting for an MCP client to connect over its stdin/stdout. You don't run it in a terminal yourself — your MCP client spawns it. Use `npx @diecoscai/hevy-mcp --help` or `--version` if you want a non-blocking invocation.

> **Write tools are dry-run by default.** The first time you ask the server to create or update anything (a workout, a routine, a body measurement) you'll see a preview payload, not a real change. Set `HEVY_MCP_ALLOW_WRITES=1` in the same `env` block to execute writes — see [Safety](#safety--dry-run-writes).

## Configuration

Each MCP client spawns the server as a stdio subprocess with `HEVY_API_KEY` in its `env` block.

### Claude Desktop

Config path:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json` *(Anthropic does not ship an official Linux build of Claude Desktop as of 2026; the path applies only to unofficial community builds.)*

```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": ["-y", "@diecoscai/hevy-mcp"],
      "env": {
        "HEVY_API_KEY": "PASTE_YOUR_KEY_HERE"
      }
    }
  }
}
```

Add `"HEVY_MCP_ALLOW_WRITES": "1"` to the `env` block to enable write tools.

### Claude Code CLI

```bash
claude mcp add hevy --env HEVY_API_KEY=PASTE_YOUR_KEY_HERE -- npx -y @diecoscai/hevy-mcp
```

To enable writes, append `--env HEVY_MCP_ALLOW_WRITES=1`.

### Cursor

Config path: `~/.cursor/mcp.json`. Same shape as Claude Desktop:

```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": ["-y", "@diecoscai/hevy-mcp"],
      "env": {
        "HEVY_API_KEY": "PASTE_YOUR_KEY_HERE"
      }
    }
  }
}
```

### VS Code (native MCP support, 1.102+)

Create `.vscode/mcp.json` at the root of your workspace (or put the same shape under a user-level MCP config if your VS Code build supports one):

```json
{
  "servers": {
    "hevy": {
      "command": "npx",
      "args": ["-y", "@diecoscai/hevy-mcp"],
      "env": {
        "HEVY_API_KEY": "PASTE_YOUR_KEY_HERE"
      }
    }
  }
}
```

If you use a third-party MCP extension that expects a different shape, check its docs — VS Code's native MCP integration landed in 1.102.

See [`docs/configuration.md`](./docs/configuration.md) for troubleshooting and client-specific notes, and [`docs/examples.md`](./docs/examples.md) for end-to-end flows you can run with a connected MCP client.

## Safety — dry-run writes

Every `POST` and `PUT` tool handler checks `HEVY_MCP_ALLOW_WRITES` at call time:

- Unset (default) — the tool returns a preview instead of making the HTTP call:

  ```json
  {
    "dry_run": true,
    "would_send": {
      "method": "POST",
      "path": "/v1/routine_folders",
      "body": { "routine_folder": { "title": "Push days" } }
    },
    "hint": "set HEVY_MCP_ALLOW_WRITES=1 to execute"
  }
  ```

- Set to `1` — the tool performs the real request.

The Hevy API has **no `DELETE` endpoint** on any resource. A bad write cannot be rolled back from the client — it will persist on your account until you manually fix it in the Hevy app. Dry-run is the first line of defence; explicit opt-in for writes is the second.

## Tool reference (summary)

The server exposes 22 tools grouped by resource. See [`docs/tools.md`](./docs/tools.md) for input schemas and examples.

### User

| Tool | Description |
| --- | --- |
| `hevy_get_user_info` | Return the authenticated user (name, id, profile URL). |

### Workouts

| Tool | Description |
| --- | --- |
| `hevy_list_workouts` | Paginated workouts (`pageSize` 1-10). |
| `hevy_get_workout` | Fetch one workout by UUID. |
| `hevy_get_workout_count` | Total number of workouts on the account. |
| `hevy_get_workout_events` | Delta-sync feed: `updated` / `deleted` events since a timestamp. |
| `hevy_create_workout` | Log a new workout (write — dry-run default). |
| `hevy_update_workout` | Full replace of an existing workout (write — dry-run default). |

### Routines

| Tool | Description |
| --- | --- |
| `hevy_list_routines` | Paginated routines. |
| `hevy_get_routine` | Fetch one routine by UUID. |
| `hevy_create_routine` | Create a routine (write — dry-run default). |
| `hevy_update_routine` | Full replace of a routine (write — dry-run default). |

### Routine folders

| Tool | Description |
| --- | --- |
| `hevy_list_routine_folders` | Paginated folders. |
| `hevy_get_routine_folder` | Fetch one folder by positive integer id. |
| `hevy_create_routine_folder` | Create a folder (write — dry-run default). |

### Exercise templates

| Tool | Description |
| --- | --- |
| `hevy_list_exercise_templates` | Paginated exercise library — the only list that accepts `pageSize` up to 100. |
| `hevy_get_exercise_template` | Fetch one template by id (8-char hex for built-ins, UUID for custom). |
| `hevy_create_exercise_template` | Create a custom exercise (write — dry-run default). |
| `hevy_get_exercise_history` | All logged sets for a given exercise template. |

### Body measurements

| Tool | Description |
| --- | --- |
| `hevy_list_body_measurements` | Paginated measurements. Records are keyed by date. |
| `hevy_get_body_measurement` | Fetch the record for a single `YYYY-MM-DD`. |
| `hevy_create_body_measurement` | Create a new record (write — dry-run default). `409` if the date already exists. |
| `hevy_update_body_measurement` | Replace the record for a date — any field not sent is set to `NULL` (write — dry-run default). |

## Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `HEVY_API_KEY` | required | Hevy Pro API key (UUID v4). Typically passed through the `env` block of your MCP client config. |
| `HEVY_MCP_ALLOW_WRITES` | optional | Set to `1` to enable real `POST` / `PUT` calls. Any other value (including unset) keeps dry-run on. |

## Development

```bash
git clone https://github.com/diecoscai/hevy-mcp.git
cd hevy-mcp
npm ci
npm run build
npm test
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | `tsc --watch` for the source. |
| `npm run lint` | Biome lint across `src/` + `tests/`. |
| `npm run format` | Biome auto-format. |
| `npm run check` | Biome combined lint + format check. |
| `npm run coverage` | Vitest with V8 coverage. |
| `npm run smoke` | End-to-end: `npm ci && build && test && lint` + stdio probe + language gate. |
| `npm run inspect` | Launches the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) against the built server. |

Adding a tool:

1. Add a Zod schema in `src/validate.ts` (`.strict()` on every object).
2. Add the tool spec (name, description, JSON Schema `inputSchema`) to the `TOOLS` array in `src/index.ts`.
3. Add a `case` in the dispatch switch; always call `validateInput(name, rawArgs)` before touching the network; wrap writes with `guardWrite`.
4. Extend tests under `tests/` (schema + negative probes at minimum).
5. Update the table in this README.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for more.

## Security

- API keys live in your MCP client's config file (same threat model as any other key you'd paste there). The server never reads or writes a config file of its own.
- Writes are dry-run by default; rotating a leaked key in the Hevy app and pasting the new one into your client config takes under a minute.
- The server only ever calls documented `/v1/*` endpoints — no private API traffic, no telemetry, no third-party fan-out.

See [`docs/security.md`](./docs/security.md) for the full threat model.

## Contributing

Contributions welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a PR.

## License

[MIT](./LICENSE).

## Links

- Hevy public API docs — <https://api.hevyapp.com/docs>
- MCP registry entry — <https://registry.modelcontextprotocol.io/v0/servers?search=io.github.diecoscai/hevy-mcp> (populated after publish)
- Issue tracker — <https://github.com/diecoscai/hevy-mcp/issues>
- MCP spec — <https://modelcontextprotocol.io>
