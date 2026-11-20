import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

const ipBuckets = new Map<string, RateLimitRecord>();

// Clean up stale buckets every 5 minutes to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 300000;
  for (const [key, record] of ipBuckets.entries()) {
    record.timestamps = record.timestamps.filter((t) => t > cutoff);
    if (record.timestamps.length === 0) {
      ipBuckets.delete(key);
    }
  }
}, 300000).unref();

/**
 * In-memory sliding window rate limiter middleware.
 * Prevents enumeration, brute-force attacks, and denial-of-service on sensitive endpoints.
 *
 * Architectural limitation: State is stored in process memory (`Map`), so limits are
 * enforced per running Node.js instance. Under multi-instance Cloud Run or Render auto-scaling,
 * limits are not shared globally across instances without an external shared store (e.g., Redis).
 */
export function createRateLimiter(options: {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
}) {
  const windowMs = options.windowMs || 60000;
  const maxRequests = options.maxRequests || 60;
  const keyPrefix = options.keyPrefix || 'rl';

  return (req: Request, res: Response, next: NextFunction): void => {
    // Bypass in test mode for automated test suites
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const identifier = req.user?.uid || req.ip || req.socket.remoteAddress || 'unknown';
    const bucketKey = `${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = ipBuckets.get(bucketKey);
    if (!record) {
      record = { timestamps: [] };
      ipBuckets.set(bucketKey, record);
    }

    // Filter to requests within current window
    record.timestamps = record.timestamps.filter((t) => t > windowStart);

    if (record.timestamps.length >= maxRequests) {
      const oldest = record.timestamps[0];
      const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again in ${retryAfterSec} seconds.`,
        },
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };
}
