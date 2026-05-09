/**
 * SQLite-backed rate limiter — persistent across server restarts.
 *
 * Buckets are keyed by Clerk user ID (falls back to IP).
 * Unlike the previous in-memory Map implementation, rate limit state
 * survives restarts and is shared across potential worker processes.
 *
 * Uses a dedicated `rate_limit_buckets` table in the existing SQLite DB.
 */
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { getSQLite } from '../db/sqlite';

let initialized = false;

function ensureTable() {
  if (initialized) return;
  const db = getSQLite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key       TEXT NOT NULL,
      limiter   TEXT NOT NULL,
      count     INTEGER NOT NULL DEFAULT 1,
      reset_at  INTEGER NOT NULL,
      PRIMARY KEY (key, limiter)
    );
    CREATE INDEX IF NOT EXISTS idx_rl_reset ON rate_limit_buckets(reset_at);
  `);
  initialized = true;
}

// Sweep expired buckets every 2 minutes
let sweepStarted = false;
function startSweep() {
  if (sweepStarted) return;
  sweepStarted = true;
  setInterval(() => {
    try {
      const db = getSQLite();
      db.prepare('DELETE FROM rate_limit_buckets WHERE reset_at < ?').run(Date.now());
    } catch { /* ignore */ }
  }, 120_000).unref();
}

function createLimiter(options: { name: string; windowMs: number; max: number; message: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureTable();
      startSweep();

      const db = getSQLite();
      const key = (req as AuthenticatedRequest).clerkId ?? req.ip ?? 'anon';
      const now = Date.now();

      // Try to get the existing bucket
      const row = db.prepare(
        'SELECT count, reset_at FROM rate_limit_buckets WHERE key = ? AND limiter = ?'
      ).get(key, options.name) as { count: number; reset_at: number } | undefined;

      // No bucket or expired → create fresh
      if (!row || row.reset_at < now) {
        db.prepare(
          'INSERT OR REPLACE INTO rate_limit_buckets (key, limiter, count, reset_at) VALUES (?, ?, 1, ?)'
        ).run(key, options.name, now + options.windowMs);
        return next();
      }

      // Exceeded limit
      if (row.count >= options.max) {
        const retryAfter = Math.ceil((row.reset_at - now) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ error: options.message });
      }

      // Increment counter
      db.prepare(
        'UPDATE rate_limit_buckets SET count = count + 1 WHERE key = ? AND limiter = ?'
      ).run(key, options.name);

      next();
    } catch (err) {
      // Fail-open: if the rate limiter itself errors, don't block the request
      console.warn('[RateLimiter] Error, allowing request:', (err as Error).message);
      next();
    }
  };
}

/** 20 AI requests / min — applied to /api/chat/send and /api/chat/stream */
export const chatRateLimiter = createLimiter({
  name: 'chat',
  windowMs: 60_000,
  max: 20,
  message: 'Too many chat requests — please wait a moment.',
});

/** 10 uploads / min */
export const uploadRateLimiter = createLimiter({
  name: 'upload',
  windowMs: 60_000,
  max: 10,
  message: 'Upload limit reached — please wait a moment.',
});

/** 5 sandbox creates / min — sandboxes are expensive */
export const sandboxRateLimiter = createLimiter({
  name: 'sandbox',
  windowMs: 60_000,
  max: 5,
  message: 'Sandbox creation limit reached — please wait.',
});
