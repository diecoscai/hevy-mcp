import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isValidApiKey,
  MissingCredentialsError,
  resolveAllowWrites,
  resolveApiKey,
} from '../src/config.js';
import { writeUserConfig } from '../src/userConfig.js';

const VALID_KEY = '0e580717-0178-4733-9c5f-f7164f91fff9';

describe('isValidApiKey', () => {
  it('accepts a canonical UUID v4', () => {
    expect(isValidApiKey(VALID_KEY)).toBe(true);
  });

  it('accepts an uppercase UUID v4', () => {
    expect(isValidApiKey(VALID_KEY.toUpperCase())).toBe(true);
  });

  it('accepts a key with surrounding whitespace (caller is expected to trim)', () => {
    expect(isValidApiKey(`  ${VALID_KEY}  `)).toBe(true);
  });

  it('rejects the empty string', () => {
    expect(isValidApiKey('')).toBe(false);
  });

  it('rejects a non-UUID string', () => {
    expect(isValidApiKey('not-a-uuid')).toBe(false);
  });

  it('rejects a UUID v1 (wrong version nibble)', () => {
    expect(isValidApiKey('0e580717-0178-1733-9c5f-f7164f91fff9')).toBe(false);
  });

  it('rejects a UUID with wrong variant nibble', () => {
    expect(isValidApiKey('0e580717-0178-4733-1c5f-f7164f91fff9')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidApiKey(undefined)).toBe(false);
    expect(isValidApiKey(null)).toBe(false);
    expect(isValidApiKey(42)).toBe(false);
    expect(isValidApiKey({})).toBe(false);
  });
});

describe('resolveApiKey', () => {
  // Every case sets XDG_CONFIG_HOME to an isolated empty dir so the
  // on-disk config-file fallback is deterministic.
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hevy-cfg-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns the env key when set', () => {
    expect(resolveApiKey({ HEVY_API_KEY: VALID_KEY, XDG_CONFIG_HOME: tmp })).toBe(VALID_KEY);
  });

  it('trims surrounding whitespace', () => {
    expect(resolveApiKey({ HEVY_API_KEY: `  ${VALID_KEY}\n`, XDG_CONFIG_HOME: tmp })).toBe(VALID_KEY);
  });

  it('throws MissingCredentialsError when env is unset and no config file exists', () => {
    expect(() => resolveApiKey({ XDG_CONFIG_HOME: tmp })).toThrow(MissingCredentialsError);
  });

  it('throws MissingCredentialsError when the env var is empty and no config file exists', () => {
    expect(() => resolveApiKey({ HEVY_API_KEY: '', XDG_CONFIG_HOME: tmp })).toThrow(
      MissingCredentialsError
    );
  });

  it('falls back to the config file when no env key is set', () => {
    writeUserConfig({ apiKey: VALID_KEY, allowWrites: false }, { XDG_CONFIG_HOME: tmp });
    expect(resolveApiKey({ XDG_CONFIG_HOME: tmp })).toBe(VALID_KEY);
  });

  it('env key takes precedence over the config file', () => {
    writeUserConfig({ apiKey: 'config-file-key', allowWrites: false }, { XDG_CONFIG_HOME: tmp });
    expect(resolveApiKey({ HEVY_API_KEY: VALID_KEY, XDG_CONFIG_HOME: tmp })).toBe(VALID_KEY);
  });

  it('error message mentions HEVY_API_KEY', () => {
    try {
      resolveApiKey({ XDG_CONFIG_HOME: tmp });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingCredentialsError);
      expect((err as Error).message).toContain('HEVY_API_KEY');
    }
  });

  it('error message points users to the Hevy developer settings page', () => {
    try {
      resolveApiKey({ XDG_CONFIG_HOME: tmp });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('hevy.com/settings?developer');
    }
  });
});

describe('resolveAllowWrites', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hevy-cfg-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('is true when HEVY_MCP_ALLOW_WRITES=1', () => {
    expect(resolveAllowWrites({ HEVY_MCP_ALLOW_WRITES: '1', XDG_CONFIG_HOME: tmp })).toBe(true);
  });

  it('is false when HEVY_MCP_ALLOW_WRITES is set to anything other than 1', () => {
    expect(resolveAllowWrites({ HEVY_MCP_ALLOW_WRITES: '0', XDG_CONFIG_HOME: tmp })).toBe(false);
  });

  it('an explicit env value overrides a config file that enables writes', () => {
    writeUserConfig({ apiKey: 'k', allowWrites: true }, { XDG_CONFIG_HOME: tmp });
    expect(resolveAllowWrites({ HEVY_MCP_ALLOW_WRITES: '0', XDG_CONFIG_HOME: tmp })).toBe(false);
  });

  it('falls back to the config file when the env var is unset', () => {
    writeUserConfig({ apiKey: 'k', allowWrites: true }, { XDG_CONFIG_HOME: tmp });
    expect(resolveAllowWrites({ XDG_CONFIG_HOME: tmp })).toBe(true);
  });

  it('is false when neither env nor config file enable writes', () => {
    expect(resolveAllowWrites({ XDG_CONFIG_HOME: tmp })).toBe(false);
  });
});
