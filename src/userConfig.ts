import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Optional on-disk config written by the `setup` subcommand. Lets users
// configure the server once instead of hand-editing the env block of every
// MCP client. Environment variables always take precedence over this file.

export interface UserConfig {
  apiKey?: string;
  allowWrites?: boolean;
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME;
  const base = typeof xdg === 'string' && xdg.trim().length > 0 ? xdg : join(homedir(), '.config');
  return join(base, 'hevy-mcp');
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), 'config.json');
}

export function readUserConfig(env: NodeJS.ProcessEnv = process.env): UserConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath(env), 'utf8');
  } catch {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== 'object') return {};
  const obj = parsed as Record<string, unknown>;
  const result: UserConfig = {};
  if (typeof obj.apiKey === 'string') result.apiKey = obj.apiKey;
  if ('allowWrites' in obj) result.allowWrites = obj.allowWrites === true;
  return result;
}

export function writeUserConfig(cfg: UserConfig, env: NodeJS.ProcessEnv = process.env): string {
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = configPath(env);
  const body = JSON.stringify(
    { apiKey: cfg.apiKey ?? '', allowWrites: cfg.allowWrites === true },
    null,
    2
  );
  writeFileSync(path, `${body}\n`, { mode: 0o600 });
  // writeFileSync's mode only applies on creation — enforce 0600 on
  // overwrite of an existing (possibly looser) file too.
  chmodSync(path, 0o600);
  return path;
}
