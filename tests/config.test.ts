import { describe, expect, it } from 'vitest';
import { isValidApiKey, MissingCredentialsError, resolveApiKey } from '../src/config.js';

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
  it('returns the env key when set', () => {
    expect(resolveApiKey({ HEVY_API_KEY: VALID_KEY })).toBe(VALID_KEY);
  });

  it('trims surrounding whitespace', () => {
    expect(resolveApiKey({ HEVY_API_KEY: `  ${VALID_KEY}\n` })).toBe(VALID_KEY);
  });

  it('throws MissingCredentialsError when the env var is unset', () => {
    expect(() => resolveApiKey({})).toThrow(MissingCredentialsError);
  });

  it('throws MissingCredentialsError when the env var is empty', () => {
    expect(() => resolveApiKey({ HEVY_API_KEY: '' })).toThrow(MissingCredentialsError);
  });

  it('throws MissingCredentialsError when the env var is whitespace only', () => {
    expect(() => resolveApiKey({ HEVY_API_KEY: '   \n' })).toThrow(MissingCredentialsError);
  });

  it('error message mentions HEVY_API_KEY', () => {
    try {
      resolveApiKey({});
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingCredentialsError);
      expect((err as Error).message).toContain('HEVY_API_KEY');
    }
  });

  it('error message points users to the Hevy developer settings page', () => {
    try {
      resolveApiKey({});
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('hevy.com/settings?developer');
    }
  });
});
