/**
 * Bounded LRU Cache-Aside & Stampede Coalescing Service
 * Designed for 100K-user multi-tenant workloads with deterministic tenant key isolation.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheService {
  private readonly store = new Map<string, CacheEntry<any>>();
  private readonly inflight = new Map<string, Promise<any>>();
  private readonly maxEntries: number;

  public hits = 0;
  public misses = 0;
  public evictions = 0;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  public get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    // Refresh LRU order
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs = 30_000): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
        this.evictions++;
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  public async getOrSet<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = loader()
      .then((val) => {
        this.set(key, val, ttlMs);
        this.inflight.delete(key);
        return val;
      })
      .catch((err) => {
        this.inflight.delete(key);
        throw err;
      });

    this.inflight.set(key, promise);
    return promise;
  }

  public invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  public stats() {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatePct: total > 0 ? Math.round((this.hits / total) * 1000) / 10 : 0,
    };
  }
}

export const cacheService = new CacheService(15_000);
