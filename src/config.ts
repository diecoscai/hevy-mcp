import { readUserConfig } from './userConfig.js';

export class MissingCredentialsError extends Error {
  readonly code = 'MISSING_CREDENTIALS';
  constructor(message?: string) {
    super(
      message ??
        'No Hevy API key found. Set HEVY_API_KEY in the env block of your MCP client config to a key from https://hevy.com/settings?developer (requires a Hevy Pro subscription), or run `npx @diecoscai/hevy-mcp setup`.'
    );
    this.name = 'MissingCredentialsError';
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidApiKey(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value.trim());
}

export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.HEVY_API_KEY;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  const fromFile = readUserConfig(env).apiKey;
  if (typeof fromFile === 'string' && fromFile.trim().length > 0) {
    return fromFile.trim();
  }
  throw new MissingCredentialsError();
}

export function resolveAllowWrites(env: NodeJS.ProcessEnv = process.env): boolean {
  // An explicit env var wins (either direction) so an MCP client's env
  // block can force writes on or off regardless of the config file.
  const raw = env.HEVY_MCP_ALLOW_WRITES;
  if (raw !== undefined) return raw === '1';
  return readUserConfig(env).allowWrites === true;
}
