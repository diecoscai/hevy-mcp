# Configuration

Detailed wiring notes for the four supported MCP clients. For the short version, see the [README](../README.md#configuration).

## Common mechanics

All MCP clients launch the server as a stdio subprocess. The recommended invocation is `npx -y @diecoscai/hevy-mcp`:

- `-y` skips npm's install confirmation.
- `npx` transparently caches the package; subsequent launches are fast.
- Pinning a version (`@diecoscai/hevy-mcp@0.1.0`) in the client config is recommended for production setups.

### Where does the API key come from?

Precedence (first match wins):

1. `HEVY_API_KEY` environment variable in the process that spawns the server.
2. `$XDG_CONFIG_HOME/hevy-mcp/config.json` (mode `0600`).
3. `~/.config/hevy-mcp/config.json` as a fallback when `XDG_CONFIG_HOME` is unset.

If none of the above resolves to a non-empty string, the server exits with code `1` and a pointer to `npx @diecoscai/hevy-mcp setup`.

### Enabling writes

The write-gate is **per-process**. Set `HEVY_MCP_ALLOW_WRITES=1` in the environment that spawns the server; without it, `POST` / `PUT` tools return a dry-run payload.

For most clients, add it to the `env` block alongside `HEVY_API_KEY`.

---

## Claude Desktop

Config path:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### Preferred — stored config

```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": ["-y", "@diecoscai/hevy-mcp"]
    }
  }
}
```

Run `npx @diecoscai/hevy-mcp setup` once, then restart Claude Desktop. The 22 tools should appear in the tools panel. Call `hevy_get_user_info` to confirm the key works.

### Inline env

```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": ["-y", "@diecoscai/hevy-mcp"],
      "env": {
        "HEVY_API_KEY": "00000000-0000-4000-8000-000000000000",
        "HEVY_MCP_ALLOW_WRITES": "1"
      }
    }
  }
}
```

### Troubleshooting

- **"0 tools available"** — open the Claude Desktop logs (Help → Troubleshooting → Open logs). Look for `hevy-mcp running on stdio`. If missing, the server exited before stdio attach; the next line is usually the cause.
- **"No Hevy API key found"** — run `npx @diecoscai/hevy-mcp setup` in a regular terminal (not within Claude Desktop's sandbox) and retry. The config file must be readable by the user Claude Desktop runs as.
- **`npx` path mismatch on macOS** — Claude Desktop does not inherit your shell PATH. If `which npx` in Terminal points to a Homebrew-managed Node, use that absolute path in `command`.

---

## Claude Code CLI

### Preferred — stored config

```bash
claude mcp add hevy -- npx -y @diecoscai/hevy-mcp
```

### Inline env

```bash
claude mcp add hevy \
  --env HEVY_API_KEY=00000000-0000-4000-8000-000000000000 \
  --env HEVY_MCP_ALLOW_WRITES=1 \
  -- npx -y @diecoscai/hevy-mcp
```

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
      "args": ["-y", "@diecoscai/hevy-mcp"]
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
        "HEVY_API_KEY": "00000000-0000-4000-8000-000000000000"
      }
    }
  }
}
```

Drop the `env` block if you've run `npx @diecoscai/hevy-mcp setup` and the config file is on disk. Use the command palette (`MCP: Restart servers`) after editing. For older VS Code builds using a third-party MCP extension, consult the extension's README — the config shape it expects may differ from the native `.vscode/mcp.json` format above.

---

## Verifying the installation

From any client, ask the assistant to call `hevy_get_user_info`. The response should include your username and profile URL. If you see a SEP-1303 error envelope, the message will tell you exactly what went wrong — most commonly a missing or expired key.

For deep inspection, run the MCP Inspector locally:

```bash
npm run inspect
```

This launches `@modelcontextprotocol/inspector` against the compiled server and lets you invoke every tool by hand.
