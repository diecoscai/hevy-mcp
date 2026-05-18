# Configuration

Detailed wiring notes for the four supported MCP clients. For the short version, see the [README](../README.md#configuration).

## Common mechanics

All MCP clients launch the server as a stdio subprocess. The recommended invocation is `npx -y @diecoscai/hevy-mcp`:

- `-y` skips npm's install confirmation.
- `npx` transparently caches the package; subsequent launches are fast.
- Pinning a version (e.g. `@diecoscai/hevy-mcp@0.3.0`) in the client config is recommended for production setups. Check the [latest version on npm](https://www.npmjs.com/package/@diecoscai/hevy-mcp).

### Where does the API key come from?

Authentication is a single environment variable — `HEVY_API_KEY` — passed through your MCP client's `env` block. If it is missing or empty, the server exits with code `1` and an error that names the variable and the URL to generate a key.

There is no local config file, no wizard, and no cache. Rotating the key means editing your client config and restarting the client.

### Enabling writes

The write-gate is **per-process**. Set `HEVY_MCP_ALLOW_WRITES=1` in the same `env` block as `HEVY_API_KEY`; without it, `POST` / `PUT` tools return a dry-run payload.

---

## Claude Desktop

Config path:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json` *(unofficial community builds only)*

```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": ["-y", "@diecoscai/hevy-mcp"],
      "env": {
        "HEVY_API_KEY": "PASTE_YOUR_KEY_HERE",
        "HEVY_MCP_ALLOW_WRITES": "1"
      }
    }
  }
}
```

Drop the `HEVY_MCP_ALLOW_WRITES` entry to keep writes in dry-run mode (recommended for first use).

### Troubleshooting

- **"0 tools available"** — open the Claude Desktop logs (Help → Troubleshooting → Open logs). Look for a line ending in ` running on stdio` (the full line starts with `@diecoscai/hevy-mcp@<version>`). If missing, the server exited before stdio attach; the next line is usually the cause.
- **"No Hevy API key found"** — make sure `HEVY_API_KEY` is set in the `env` block of the server entry, not in a separate root-level `env` object. Restart Claude Desktop fully after editing.
- **`npx` path mismatch on macOS** — Claude Desktop does not inherit your shell PATH. If `which npx` in Terminal points to a Homebrew-managed Node, use that absolute path in `command`.

---

## Claude Code CLI

```bash
claude mcp add hevy \
  --env HEVY_API_KEY=PASTE_YOUR_KEY_HERE \
  -- npx -y @diecoscai/hevy-mcp
```

Append `--env HEVY_MCP_ALLOW_WRITES=1` to enable writes.

Listing and removing:

```bash
claude mcp list
claude mcp remove hevy
```

The server is started on-demand when the CLI launches an agent session.

---

## Cursor

Config path: `~/.cursor/mcp.json`.

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

After editing the file, restart Cursor. Check the MCP status icon in the sidebar — it should show "hevy: 22 tools" once the server finishes handshaking.

---

## VS Code

VS Code 1.102+ ships native MCP support. Create `.vscode/mcp.json` at the root of your workspace (or use the user-level `mcp.json` supported by your VS Code build):

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

Use the command palette (`MCP: Restart servers`) after editing. For older VS Code builds using a third-party MCP extension, consult the extension's README — the config shape it expects may differ from the native `.vscode/mcp.json` format above.

---

## Verifying the installation

From any client, ask the assistant to call `hevy_get_user_info`. The response should include your username and profile URL. If you see a SEP-1303 error envelope, the message will tell you exactly what went wrong — most commonly a missing or expired key.

For deep inspection, run the MCP Inspector locally:

```bash
npm run inspect
```

This launches `@modelcontextprotocol/inspector` against the compiled server and lets you invoke every tool by hand.

## Upgrading

`npx` caches packages; a new version on npm won't be picked up until the cache entry expires or you force a refresh:

```bash
npx -y @diecoscai/hevy-mcp@latest --version
```

Pin a specific version in the client config (e.g. `@diecoscai/hevy-mcp@0.3.0`) if reproducibility matters to you.

---

## First-run troubleshooting

The most common failure modes, in roughly the order people hit them.

### "0 tools available" in the client
- Confirm the client was fully restarted after editing its config (Claude Desktop in particular needs Cmd+Q / Quit, not just window close).
- Run `npx -y @diecoscai/hevy-mcp@latest --version` in a terminal. It should print the package name and version. If `npx` cannot find `node`, fix your PATH (especially on Windows where Claude Desktop spawns from a non-login shell — see the Claude Desktop section above).
- Look at the client's MCP server logs. A missing `HEVY_API_KEY` causes the server to exit with code `1` and a message naming the variable and the URL to generate a key.

### `error_code: UPSTREAM_ERROR` with status 401
Two distinct causes, distinguished by the `hint` field of the error envelope:
- **`hint` mentions "Pro"** — your Hevy account is not on the Pro plan. The public API is Pro-only. Upgrade in the Hevy app, then retry.
- **`hint` mentions `HEVY_API_KEY`** — the key is missing, wrong, or revoked. Regenerate at <https://hevy.com/settings?developer>, paste into the client's `env` block, restart the client.

### `error_code: UPSTREAM_ERROR` with status 429
Hevy is rate-limiting your account. Wait a few seconds and retry. There is no published rate-limit number; if you hit this repeatedly, space requests by ~500 ms.

### A write tool returns `{ dry_run: true, executed: false, ... }`
This is the safety default — no HTTP call was made. To execute real writes, add `"HEVY_MCP_ALLOW_WRITES": "1"` to the `env` block of your MCP client config (next to `HEVY_API_KEY`), then **restart the client**. The Hevy API has no DELETE endpoint, so a wrong write cannot be rolled back from this server — the dry-run gate is your safety net.

### Empty `workouts: []` on first call
That is exactly what it says — the account has no workouts in that page. For a brand-new account, log a workout in the Hevy app first.

### `error_code: VALIDATION_ERROR` mentioning `"notes" too small`
The Hevy server rejects empty-string notes. Either omit `notes` entirely or send a non-empty string. The same applies to `description` on workouts.
