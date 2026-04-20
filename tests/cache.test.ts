import { describe, expect, it } from 'vitest';
import {
  createTemplateCache,
  isCacheDisabled,
  TEMPLATE_LIST_PREFIX,
  TtlCache,
  templateListKey,
  templateOneKey,
} from '../src/cache.js';

describe('TtlCache', () => {
  it('returns the value within the TTL window', () => {
    let now = 1000;
    const cache = new TtlCache<string>(500, { now: () => now });
    cache.set('a', 'first');
    now = 1499;
    expect(cache.get('a')).toBe('first');
  });

  it('returns undefined once the TTL has expired', () => {
    let now = 1000;
    const cache = new TtlCache<string>(500, { now: () => now });
    cache.set('a', 'first');
    now = 1500;
    expect(cache.get('a')).toBeUndefined();
  });

  it('reports undefined on a missing key', () => {
    const cache = new TtlCache<string>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('invalidatePrefix removes only keys matching the prefix', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('list:1:10', 'page-1');
    cache.set('list:2:10', 'page-2');
    cache.set('one:ABCDEF12', 'template');
    cache.invalidatePrefix('list:');
    expect(cache.get('list:1:10')).toBeUndefined();
    expect(cache.get('list:2:10')).toBeUndefined();
    expect(cache.get('one:ABCDEF12')).toBe('template');
  });

  it('set on an existing key refreshes the expiry', () => {
    let now = 1000;
    const cache = new TtlCache<string>(500, { now: () => now });
    cache.set('a', 'first');
    now = 1400;
    cache.set('a', 'second');
    now = 1800;
    expect(cache.get('a')).toBe('second');
    now = 1901;
    expect(cache.get('a')).toBeUndefined();
  });

  it('clear empties the store', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

describe('cache key helpers', () => {
  it('templateListKey encodes both paging params', () => {
    expect(templateListKey(2, 50)).toBe('list:2:50');
  });

  it('templateOneKey uses the one: namespace so list invalidation cannot clobber singles', () => {
    expect(templateOneKey('abc')).toBe('one:abc');
    expect(templateOneKey('abc').startsWith(TEMPLATE_LIST_PREFIX)).toBe(false);
  });
});

describe('env resolution', () => {
  it('isCacheDisabled returns true only for the literal "1"', () => {
    expect(isCacheDisabled({ HEVY_MCP_DISABLE_CACHE: '1' })).toBe(true);
    expect(isCacheDisabled({ HEVY_MCP_DISABLE_CACHE: 'true' })).toBe(false);
    expect(isCacheDisabled({})).toBe(false);
  });

  it('createTemplateCache falls back to the default TTL when the env var is invalid', () => {
    const cache = createTemplateCache({ HEVY_MCP_CACHE_TTL_SECONDS: 'not-a-number' });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('createTemplateCache respects a custom TTL via env', () => {
    const cache = createTemplateCache({ HEVY_MCP_CACHE_TTL_SECONDS: '7200' });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });
});
