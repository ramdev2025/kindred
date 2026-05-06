/**
 * In-process rate limiter — no external deps.
 * Buckets are keyed by Clerk user ID (falls back to IP).
 */
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';

interface Bucket {
  count: number;
  resetAt: number;
}

function createLimiter(options: { windowMs: number; max: number; message: string }) {
  const store = new Map<string, Bucket>();

  // Sweep expired buckets every window to avoid unbounded growth
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of store) if (b.resetAt < now) store.delete(k);
  }, options.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req as AuthenticatedRequest).clerkId ?? req.ip ?? 'anon';
    const now = Date.now();
    let bucket = store.get(key);

    if (!bucket || bucket.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (bucket.count >= options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: options.message });
    }

    bucket.count += 1;
    next();
  };
}

/** 20 AI requests / min — applied to /api/chat/send and /api/chat/stream */
export const chatRateLimiter = createLimiter({
  windowMs: 60_000,
  max: 20,
  message: 'Too many chat requests — please wait a moment.',
});

/** 10 uploads / min */
export const uploadRateLimiter = createLimiter({
  windowMs: 60_000,
  max: 10,
  message: 'Upload limit reached — please wait a moment.',
});

/** 5 sandbox creates / min — sandboxes are expensive */
export const sandboxRateLimiter = createLimiter({
  windowMs: 60_000,
  max: 5,
  message: 'Sandbox creation limit reached — please wait.',
});
