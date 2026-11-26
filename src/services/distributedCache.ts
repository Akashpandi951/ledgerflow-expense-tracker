import net from 'net';
import { config } from '../config';
import { cacheService } from './cacheService';

/**
 * Zero-dependency Redis RESP2 Adapter with automatic Circuit Breaker fallback to LRU CacheService.
 * Enables shared multi-node caching when REDIS_URL is reachable, and seamless standalone operation otherwise.
 */
export class DistributedCacheAdapter {
  private redisHealthy = false;
  private circuitOpenUntil = 0;
  private host = '127.0.0.1';
  private port = 6379;
  private configured = false;

  constructor() {
    if (config.redisUrl) {
      try {
        const u = new URL(config.redisUrl);
        this.host = u.hostname || '127.0.0.1';
        this.port = parseInt(u.port || '6379', 10);
        this.configured = true;
      } catch {
        this.configured = false;
      }
    }
  }

  private sendRespCommand(args: string[]): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (!this.configured || Date.now() < this.circuitOpenUntil) {
        reject(new Error('REDIS_UNAVAILABLE'));
        return;
      }
      const socket = net.createConnection({ host: this.host, port: this.port });
      socket.setTimeout(150);

      let buf = '';
      const payload = `*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('');

      socket.on('connect', () => {
        this.redisHealthy = true;
        socket.write(payload);
      });
      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        if (buf.endsWith('\r\n')) {
          socket.destroy();
          resolve(buf);
        }
      });
      socket.on('timeout', () => {
        socket.destroy();
        this.tripCircuit();
        reject(new Error('REDIS_TIMEOUT'));
      });
      socket.on('error', (err) => {
        socket.destroy();
        this.tripCircuit();
        reject(err);
      });
    });
  }

  private tripCircuit(): void {
    this.redisHealthy = false;
    this.circuitOpenUntil = Date.now() + 15_000;
  }

  public async get<T>(key: string): Promise<T | undefined> {
    const local = cacheService.get<T>(key);
    if (local !== undefined) return local;

    if (!this.configured || Date.now() < this.circuitOpenUntil) return undefined;
    try {
      const resp = await this.sendRespCommand(['GET', key]);
      if (!resp || resp.startsWith('$-1')) return undefined;
      const lines = resp.split('\r\n');
      if (lines.length >= 2 && lines[1]) {
        const parsed = JSON.parse(lines[1]) as T;
        cacheService.set(key, parsed, 5000);
        return parsed;
      }
    } catch {
      // Fall back silently to local LRU cache
    }
    return undefined;
  }

  public async set<T>(key: string, value: T, ttlMs = 30_000): Promise<void> {
    cacheService.set(key, value, ttlMs);
    if (!this.configured || Date.now() < this.circuitOpenUntil) return;
    try {
      const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
      await this.sendRespCommand(['SET', key, JSON.stringify(value), 'EX', String(ttlSec)]);
    } catch {
      // Fallback already persisted in local LRU
    }
  }

  public status() {
    return {
      mode: this.redisHealthy ? 'redis-cluster' : 'memory-lru-fallback',
      redisConfigured: this.configured,
      redisHealthy: this.redisHealthy,
      circuitOpen: Date.now() < this.circuitOpenUntil,
      localLru: cacheService.stats(),
    };
  }
}

export const distributedCache = new DistributedCacheAdapter();
