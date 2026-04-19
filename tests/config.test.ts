import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configDir,
  configPath,
  isValidApiKey,
  MissingCredentialsError,
  readStoredConfig,
  resolveApiKey,
} from '../src/config.js';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const ANOTHER_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('isValidApiKey', () => {
  it('accepts a real UUID v4 sample', () => {
    expect(isValidApiKey(VALID_UUID)).toBe(true);
    expect(isValidApiKey(ANOTHER_UUID)).toBe(true);
  });

  it('accepts UUIDs with surrounding whitespace (trimmed)', () => {
    expect(isValidApiKey(`  ${VALID_UUID}  `)).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidApiKey('')).toBe(false);
  });

  it('rejects whitespace-only input', () => {
    expect(isValidApiKey('   ')).toBe(false);
  });

  it('rejects wrong format (not a UUID)', () => {
    expect(isValidApiKey('not-a-uuid')).toBe(false);
    expect(isValidApiKey('12345')).toBe(false);
  });

  it('rejects a UUID without the v4 marker (e.g. version 1)', () => {
    expect(isValidApiKey('11111111-1111-1111-8111-111111111111')).toBe(false);
  });

  it('rejects a lowercase non-UUID string of the right shape', () => {
    expect(isValidApiKey('zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidApiKey(undefined as unknown as string)).toBe(false);
    expect(isValidApiKey(null as unknown as string)).toBe(false);
    expect(isValidApiKey(123 as unknown as string)).toBe(false);
  });
});

describe('configDir', () => {
  it('honors XDG_CONFIG_HOME when set and non-empty', () => {
    const env = { XDG_CONFIG_HOME: '/xdg/home', HOME: '/users/someone' };
    expect(configDir(env)).toBe('/xdg/home/hevy-mcp');
  });

  it('falls through to $HOME/.config/hevy-mcp when XDG_CONFIG_HOME is unset', () => {
    const env = { HOME: '/users/someone' };
    expect(configDir(env)).toBe('/users/someone/.config/hevy-mcp');
  });

  it('ignores empty XDG_CONFIG_HOME and uses HOME', () => {
    const env = { XDG_CONFIG_HOME: '', HOME: '/users/someone' };
    expect(configDir(env)).toBe('/users/someone/.config/hevy-mcp');
  });

  it('falls back to os.homedir() when both XDG_CONFIG_HOME and HOME are unset', () => {
    const env: NodeJS.ProcessEnv = {};
    const result = configDir(env);
    expect(result.endsWith('/.config/hevy-mcp')).toBe(true);
    expect(result.length).toBeGreaterThan('/.config/hevy-mcp'.length);
  });
});

describe('configPath', () => {
  it('is <configDir>/config.json', () => {
    const env = { XDG_CONFIG_HOME: '/xdg/home' };
    expect(configPath(env)).toBe('/xdg/home/hevy-mcp/config.json');
  });

  it('composes with the HOME fallback', () => {
    const env = { HOME: '/users/someone' };
    expect(configPath(env)).toBe('/users/someone/.config/hevy-mcp/config.json');
  });
});

describe('readStoredConfig', () => {
  let tempRoot: string;
  let env: NodeJS.ProcessEnv;
  let fullDir: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'hevy-mcp-cfg-'));
    env = { XDG_CONFIG_HOME: tempRoot };
    fullDir = join(tempRoot, 'hevy-mcp');
    await mkdir(fullDir, { recursive: true, mode: 0o700 });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('returns null when the file does not exist', async () => {
    const result = await readStoredConfig(env);
    expect(result).toBeNull();
  });

  it('returns the stored object for valid JSON with a non-empty api_key', async () => {
    const payload = {
      api_key: VALID_UUID,
      user_id: 'u-1',
      username: 'diego',
      created_at: '2026-04-19T00:00:00.000Z',
    };
    await writeFile(configPath(env), JSON.stringify(payload), 'utf8');
    const result = await readStoredConfig(env);
    expect(result).toEqual(payload);
  });

  it('returns null on malformed JSON (does not throw)', async () => {
    await writeFile(configPath(env), '{not valid json', 'utf8');
    await expect(readStoredConfig(env)).resolves.toBeNull();
  });

  it('returns null when api_key is missing or empty', async () => {
    await writeFile(configPath(env), JSON.stringify({ api_key: '' }), 'utf8');
    await expect(readStoredConfig(env)).resolves.toBeNull();

    await writeFile(configPath(env), JSON.stringify({ user_id: 'x' }), 'utf8');
    await expect(readStoredConfig(env)).resolves.toBeNull();
  });

  it('returns null when JSON is an array or non-object', async () => {
    await writeFile(configPath(env), JSON.stringify(['api_key', VALID_UUID]), 'utf8');
    // Arrays are objects in JS, so the function walks them; api_key will not be a string → null.
    const arrRes = await readStoredConfig(env);
    expect(arrRes).toBeNull();

    await writeFile(configPath(env), JSON.stringify(null), 'utf8');
    await expect(readStoredConfig(env)).resolves.toBeNull();
  });
});

describe('resolveApiKey', () => {
  let tempRoot: string;
  let env: NodeJS.ProcessEnv;
  let fullDir: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'hevy-mcp-resolve-'));
    env = { XDG_CONFIG_HOME: tempRoot };
    fullDir = join(tempRoot, 'hevy-mcp');
    await mkdir(fullDir, { recursive: true, mode: 0o700 });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('returns the env key when HEVY_API_KEY is a valid UUID and ignores the filesystem', async () => {
    // Seed a DIFFERENT key in the file so we can prove env wins.
    await writeFile(configPath(env), JSON.stringify({ api_key: ANOTHER_UUID }), 'utf8');
    const withEnv = { ...env, HEVY_API_KEY: VALID_UUID };
    const result = await resolveApiKey(withEnv);
    expect(result.apiKey).toBe(VALID_UUID);
    expect(result.source).toBe('env');
  });

  it('accepts env key with surrounding whitespace and trims it', async () => {
    const withEnv = { ...env, HEVY_API_KEY: `  ${VALID_UUID}  ` };
    const result = await resolveApiKey(withEnv);
    expect(result.apiKey).toBe(VALID_UUID);
    expect(result.source).toBe('env');
  });

  it('falls through to file when HEVY_API_KEY is an empty string', async () => {
    await writeFile(configPath(env), JSON.stringify({ api_key: VALID_UUID }), 'utf8');
    const withEnv = { ...env, HEVY_API_KEY: '' };
    const result = await resolveApiKey(withEnv);
    expect(result.apiKey).toBe(VALID_UUID);
    expect(result.source).toBe('file');
  });

  it('returns the file key when env is unset', async () => {
    await writeFile(configPath(env), JSON.stringify({ api_key: VALID_UUID }), 'utf8');
    const result = await resolveApiKey(env);
    expect(result.apiKey).toBe(VALID_UUID);
    expect(result.source).toBe('file');
  });

  it('throws MissingCredentialsError when no env and no file', async () => {
    await expect(resolveApiKey(env)).rejects.toBeInstanceOf(MissingCredentialsError);
  });

  it('MissingCredentialsError message mentions the setup command and HEVY_API_KEY', async () => {
    try {
      await resolveApiKey(env);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingCredentialsError);
      const message = (err as Error).message;
      expect(message).toContain('npx @diecoscai/hevy-mcp setup');
      expect(message).toContain('HEVY_API_KEY');
    }
  });

  it('throws MissingCredentialsError when file has invalid api_key and env is unset', async () => {
    // File present but api_key is an empty string → readStoredConfig returns null.
    await writeFile(configPath(env), JSON.stringify({ api_key: '' }), 'utf8');
    await expect(resolveApiKey(env)).rejects.toBeInstanceOf(MissingCredentialsError);
  });
});
