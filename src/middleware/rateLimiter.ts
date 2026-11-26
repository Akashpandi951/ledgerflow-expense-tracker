import { Request, Response, NextFunction } from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 50_000;
const clientBuckets = new Map<string, RateLimitBucket>();

// Periodic sweep to keep memory bounded under high-cardinality traffic
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of clientBuckets.entries()) {
    if (now > b.resetAt) clientBuckets.delete(k);
  }
}, 60_000);
if (sweepTimer.unref) sweepTimer.unref();

export function rateLimiter(options: { maxRequests: number; windowMs: number; message?: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    const tenant = (req.headers['x-organization-id'] as string) || 'public';
    const key = `${req.path}:${tenant}:${ip}`;
    const now = Date.now();

    const bucket = clientBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      if (clientBuckets.size >= MAX_BUCKETS) {
        const oldestKey = clientBuckets.keys().next().value;
        if (oldestKey !== undefined) clientBuckets.delete(oldestKey);
      }
      clientBuckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', options.maxRequests - 1);
      next();
      return;
    }

    if (bucket.count >= options.maxRequests) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: options.message || 'Too many requests. Please slow down and try again later.',
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', options.maxRequests - bucket.count);
    next();
  };
}
