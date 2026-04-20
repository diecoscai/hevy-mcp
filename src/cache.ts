// In-memory TTL cache for exercise templates. The template catalog is
// large (~200 entries) and near-static within a session, so repeated
// resolution (e.g. looking up template ids to build a routine) benefits
// strongly from caching. Invalidated on hevy_create_exercise_template.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface Clock {
  now(): number;
}

const defaultClock: Clock = { now: () => Date.now() };

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(
    private ttlMs: number,
    private clock: Clock = defaultClock
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: this.clock.now() + this.ttlMs });
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

const DEFAULT_TTL_SECONDS = 3600;

function resolveTtlSeconds(env: NodeJS.ProcessEnv): number {
  const raw = env.HEVY_MCP_CACHE_TTL_SECONDS;
  if (typeof raw !== 'string' || raw.trim().length === 0) return DEFAULT_TTL_SECONDS;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_SECONDS;
  return parsed;
}

export function isCacheDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HEVY_MCP_DISABLE_CACHE === '1';
}

export function createTemplateCache(env: NodeJS.ProcessEnv = process.env): TtlCache<unknown> {
  return new TtlCache<unknown>(resolveTtlSeconds(env) * 1000);
}

export function templateListKey(page: number, pageSize: number): string {
  return `list:${page}:${pageSize}`;
}

export function templateOneKey(id: string): string {
  return `one:${id}`;
}

export const TEMPLATE_LIST_PREFIX = 'list:';
export const TEMPLATE_ALL_KEY = 'all:templates';
