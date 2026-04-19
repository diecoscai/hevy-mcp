import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export class MissingCredentialsError extends Error {
  readonly code = 'MISSING_CREDENTIALS';
  constructor(message?: string) {
    super(
      message ??
        'No Hevy API key found. Run `npx @diecoscai/hevy-mcp setup` to configure, or export HEVY_API_KEY.'
    );
    this.name = 'MissingCredentialsError';
  }
}

export interface StoredConfig {
  api_key: string;
  user_id?: string;
  username?: string;
  created_at?: string;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidApiKey(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value.trim());
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    return join(xdg, 'hevy-mcp');
  }
  const home = env.HOME ?? homedir();
  return join(home, '.config', 'hevy-mcp');
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), 'config.json');
}

export async function readStoredConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<StoredConfig | null> {
  try {
    const raw = await readFile(configPath(env), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const apiKey = record.api_key;
    if (typeof apiKey !== 'string' || apiKey.length === 0) return null;
    return {
      api_key: apiKey,
      user_id: typeof record.user_id === 'string' ? record.user_id : undefined,
      username: typeof record.username === 'string' ? record.username : undefined,
      created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    return null;
  }
}

export async function resolveApiKey(
  env: NodeJS.ProcessEnv = process.env
): Promise<{ apiKey: string; source: 'env' | 'file' }> {
  const envKey = env.HEVY_API_KEY;
  if (typeof envKey === 'string' && envKey.trim().length > 0) {
    return { apiKey: envKey.trim(), source: 'env' };
  }
  const stored = await readStoredConfig(env);
  if (stored && isValidApiKey(stored.api_key)) {
    return { apiKey: stored.api_key, source: 'file' };
  }
  throw new MissingCredentialsError();
}
